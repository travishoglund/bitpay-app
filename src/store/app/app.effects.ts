import {SEGMENT_API_KEY, APPSFLYER_API_KEY, APPSFLYER_APP_ID} from '@env';
import Segment, {JsonMap} from '@segment/analytics-react-native';
import {Options} from '@segment/analytics-react-native/build/esm/bridge';
import BitAuth from 'bitauth';
import i18n from 'i18next';
import {DeviceEventEmitter, Linking, Platform} from 'react-native';
import AdID from 'react-native-advertising-id-bp';
import ReactAppboy from 'react-native-appboy-sdk';
import AppsFlyer from 'react-native-appsflyer';
import RNBootSplash from 'react-native-bootsplash';
import InAppBrowser, {
  InAppBrowserOptions,
} from 'react-native-inappbrowser-reborn';
import {checkNotifications, RESULTS} from 'react-native-permissions';
import {requestTrackingPermission} from 'react-native-tracking-transparency';
import uuid from 'react-native-uuid';
import {batch} from 'react-redux';
import {AppActions} from '.';
import BitPayApi from '../../api/bitpay';
import GraphQlApi from '../../api/graphql';
import UserApi from '../../api/user';
import {OnGoingProcessMessages} from '../../components/modal/ongoing-process/OngoingProcess';
import {Network} from '../../constants';
import {isAxiosError} from '../../utils/axios';
import {sleep} from '../../utils/helper-methods';
import {BitPayIdEffects} from '../bitpay-id';
import {CardEffects} from '../card';
import {coinbaseInitialize} from '../coinbase';
import {RootState, Effect} from '../index';
import {LocationEffects} from '../location';
import {LogActions} from '../log';
import {WalletActions} from '../wallet';
import {walletConnectInit} from '../wallet-connect/wallet-connect.effects';
import {startMigration, startWalletStoreInit} from '../wallet/effects';
import {
  setAppFirstOpenEventComplete,
  setAppFirstOpenEventDate,
  setBrazeEid,
  setConfirmedTxAccepted,
  setMigrationComplete,
  setNotificationsAccepted,
  setOffersAndPromotionsAccepted,
  setProductsUpdatesAccepted,
  showBlur,
} from './app.actions';
import {AppIdentity} from './app.models';
import {
  findKeyByKeyId,
  findWalletByIdHashed,
  getAllWalletClients,
} from '../wallet/utils/wallet';
import {SilentPushEvent} from '../../Root';
import {
  startUpdateAllKeyAndWalletStatus,
  startUpdateAllWalletStatusForKey,
  startUpdateWalletStatus,
} from '../wallet/effects/status/status';
import {createWalletAddress} from '../wallet/effects/address/address';
import {DeviceEmitterEvents} from '../../constants/device-emitter-events';
import {APP_ANALYTICS_ENABLED} from '../../constants/config';

// Subscription groups (Braze)
const PRODUCTS_UPDATES_GROUP_ID = __DEV__
  ? '27c86a0b-2a91-4383-b05b-5e671554f186'
  : 'fe2146a6-f5ed-4df7-81de-7ed9cd019d23';
const OFFERS_AND_PROMOTIONS_GROUP_ID = __DEV__
  ? '6be103aa-4df0-46f6-a3fa-438e61aadced'
  : '1d1db929-909d-40e0-93ec-34106ea576b4';

export const startAppInit = (): Effect => async (dispatch, getState) => {
  try {
    dispatch(LogActions.clear());
    dispatch(LogActions.info(`Initializing app (${__DEV__ ? 'D' : 'P'})...`));

    await dispatch(startWalletStoreInit());

    const {appFirstOpenData, onboardingCompleted, migrationComplete} =
      getState().APP;

    if (!appFirstOpenData?.firstOpenDate) {
      dispatch(setAppFirstOpenEventDate());
    }

    // init analytics -> post onboarding or migration
    if (onboardingCompleted) {
      dispatch(askForTrackingPermissionAndEnableSdks(true));
    }

    if (!migrationComplete) {
      await dispatch(startMigration());
      dispatch(setMigrationComplete());
    }

    const {BITPAY_ID} = getState();
    const {network, pinLockActive, biometricLockActive, colorScheme} =
      getState().APP;

    dispatch(LogActions.debug(`Network: ${network}`));
    dispatch(LogActions.debug(`Theme: ${colorScheme || 'system'}`));

    const token = BITPAY_ID.apiToken[network];
    const isPaired = !!token;
    const identity = dispatch(initializeAppIdentity());

    await dispatch(initializeApi(network, identity));

    dispatch(LocationEffects.getCountry());

    if (isPaired) {
      try {
        dispatch(
          LogActions.info(
            'App is paired with BitPayID, refreshing user data...',
          ),
        );

        const {errors, data} = await UserApi.fetchInitialUserData(token);

        // handle partial errors
        if (errors) {
          const msg = errors
            .map(e => `${e.path.join('.')}: ${e.message}`)
            .join(',\n');

          dispatch(
            LogActions.error(
              'One or more errors occurred while fetching initial user data:\n' +
                msg,
            ),
          );
        }
        await dispatch(BitPayIdEffects.startBitPayIdStoreInit(data.user));
        dispatch(CardEffects.startCardStoreInit(data.user));
      } catch (err: any) {
        if (isAxiosError(err)) {
          dispatch(LogActions.error(`${err.name}: ${err.message}`));
          dispatch(LogActions.error(err.config.url));
          dispatch(LogActions.error(JSON.stringify(err.config.data || {})));
        } else if (err instanceof Error) {
          dispatch(LogActions.error(`${err.name}: ${err.message}`));
        } else {
          dispatch(LogActions.error(JSON.stringify(err)));
        }

        dispatch(
          LogActions.info(
            'Failed to refresh user data. Continuing initialization.',
          ),
        );
      }
    }

    // splitting inits into store specific ones as to keep it cleaner in the main init here
    await dispatch(walletConnectInit());
    await dispatch(initializeBrazeContent());

    // Update Coinbase
    dispatch(coinbaseInitialize());
    dispatch(showBlur(pinLockActive || biometricLockActive));
    dispatch(AppActions.successAppInit());
    await sleep(500);
    dispatch(LogActions.info('Initialized app successfully.'));
    dispatch(LogActions.debug(`Pin Lock Active: ${pinLockActive}`));
    dispatch(LogActions.debug(`Biometric Lock Active: ${biometricLockActive}`));
    RNBootSplash.hide({fade: true}).then(() => {
      // avoid splash conflicting with modal in iOS
      // https://stackoverflow.com/questions/65359539/showing-a-react-native-modal-right-after-app-startup-freezes-the-screen-in-ios
      if (pinLockActive) {
        dispatch(AppActions.showPinModal({type: 'check'}));
      }
      if (biometricLockActive) {
        dispatch(AppActions.showBiometricModal());
      }
    });
  } catch (err) {
    console.error(err);
    dispatch(AppActions.failedAppInit());
    dispatch(LogActions.error('Failed to initialize app.'));
    dispatch(LogActions.error(JSON.stringify(err)));
  }
};

/**
 * Checks to ensure that the App Identity is defined, else generates a new one.
 * @returns The App Identity.
 */
const initializeAppIdentity =
  (): Effect<AppIdentity> => (dispatch, getState) => {
    const {APP} = getState();
    let identity = APP.identity[APP.network];

    dispatch(LogActions.info('Initializing App Identity...'));

    if (!identity || !Object.keys(identity).length || !identity.priv) {
      try {
        dispatch(LogActions.info('Generating new App Identity...'));

        identity = BitAuth.generateSin();

        dispatch(AppActions.successGenerateAppIdentity(APP.network, identity));
      } catch (error) {
        dispatch(
          LogActions.error(
            'Error generating App Identity: ' + JSON.stringify(error),
          ),
        );
        dispatch(AppActions.failedGenerateAppIdentity());
      }
    }

    dispatch(LogActions.info('Initialized App Identity successfully.'));

    return identity;
  };

/**
 * Initializes APIs for the given network and identity.
 * @param network
 * @param identity
 * @returns void
 */
const initializeApi =
  (network: Network, identity: AppIdentity): Effect =>
  () => {
    BitPayApi.init(network, identity);
    GraphQlApi.init(network, identity);
  };

/**
 * Initializes Braze content by checking for a paired user, refreshing the
 * Braze cache, then fetching data from Braze and commiting it to the store.
 * @returns void
 */
export const initializeBrazeContent =
  (): Effect => async (dispatch, getState) => {
    try {
      dispatch(LogActions.info('Initializing Braze content...'));
      const {APP, BITPAY_ID} = getState();
      const user = BITPAY_ID.user[APP.network];

      if (user) {
        ReactAppboy.changeUser(user.eid);
        ReactAppboy.setEmail(user.email);
        dispatch(setBrazeEid(user.eid));
      } else {
        const eid = APP.brazeEid || uuid.v4().toString();
        console.log('###### EXTERNAL ID: ', eid); /* TODO */
        ReactAppboy.changeUser(eid);
        dispatch(setBrazeEid(eid));
      }

      ReactAppboy.requestContentCardsRefresh();

      const contentCards = await ReactAppboy.getContentCards();

      dispatch(LogActions.info('Successfully fetched data from Braze.'));
      dispatch(AppActions.brazeContentCardsFetched(contentCards));
    } catch (err) {
      const errMsg = 'Failed to fetch data from Braze.';

      dispatch(LogActions.error(errMsg));
      dispatch(
        LogActions.error(
          err instanceof Error ? err.message : JSON.stringify(err),
        ),
      );
    } finally {
      dispatch(LogActions.info('Initializing Braze content complete.'));
    }
  };

/**
 * Refreshes Braze content by refreshing the Braze cache, then fetching
 * data from Braze and commiting it to the store. Does not change or set user.
 * @returns void
 */
export const startRefreshBrazeContent = (): Effect => async dispatch => {
  try {
    dispatch(LogActions.info('Refreshing Braze content...'));

    ReactAppboy.requestContentCardsRefresh();

    const contentCards = await ReactAppboy.getContentCards();

    dispatch(LogActions.info('Successfully fetched data from Braze.'));
    dispatch(AppActions.brazeContentCardsFetched(contentCards));
  } catch (err) {
    const errMsg = 'Failed to fetch data from Braze.';

    dispatch(LogActions.error(errMsg));
    dispatch(
      LogActions.error(
        err instanceof Error ? err.message : JSON.stringify(err),
      ),
    );
  } finally {
    dispatch(LogActions.info('Refreshing Braze content complete.'));
  }
};

export const startOnGoingProcessModal =
  (message: OnGoingProcessMessages): Effect =>
  async (dispatch, getState: () => RootState) => {
    const store: RootState = getState();

    // if modal currently active dismiss and sleep to allow animation to complete before showing next
    if (store.APP.showOnGoingProcessModal) {
      dispatch(AppActions.dismissOnGoingProcessModal());
      await sleep(500);
    }

    dispatch(AppActions.showOnGoingProcessModal(message));
    return sleep(100);
  };

/**
 * Open a URL with the InAppBrowser if available, else lets the device handle the URL.
 * @param url
 * @param options
 * @returns
 */
export const openUrlWithInAppBrowser =
  (url: string, options: InAppBrowserOptions = {}): Effect =>
  async dispatch => {
    let isIabAvailable = false;

    try {
      isIabAvailable = await InAppBrowser.isAvailable();
    } catch (err) {
      console.log(err);
    }

    const handler = isIabAvailable ? 'InAppBrowser' : 'external app';

    try {
      dispatch(LogActions.info(`Opening URL ${url} with ${handler}`));

      if (isIabAvailable) {
        // successfully resolves after IAB is cancelled or dismissed
        const result = await InAppBrowser.open(url, {
          // iOS options
          animated: true,
          modalEnabled: true,
          modalPresentationStyle: 'pageSheet',

          // android options
          forceCloseOnRedirection: false,
          hasBackButton: true,
          showInRecents: true,

          ...options,
        });

        dispatch(
          LogActions.info(`InAppBrowser closed with type: ${result.type}`),
        );
      } else {
        // successfully resolves if an installed app handles the URL,
        // or the user confirms any presented 'open' dialog
        await Linking.openURL(url);
      }
    } catch (err) {
      const logMsg = `Error opening URL ${url} with ${handler}.\n${JSON.stringify(
        err,
      )}`;

      dispatch(LogActions.error(logMsg));
    }
  };

export const askForTrackingPermissionAndEnableSdks =
  (appInit: boolean = false): Effect<Promise<void>> =>
  async (dispatch, getState) => {
    const trackingStatus = await requestTrackingPermission();

    if (['authorized', 'unavailable'].includes(trackingStatus) && !__DEV__) {
      try {
        await new Promise<void>((resolve, reject) => {
          AppsFlyer.initSdk(
            {
              devKey: APPSFLYER_API_KEY,
              isDebug: __DEV__,
              appId: APPSFLYER_APP_ID, // iOS app id
            },
            result => {
              console.log(result);
              resolve();
            },
            error => {
              console.log(error);
              reject(error);
            },
          );
        });
      } catch (err) {
        dispatch(LogActions.error('Appsflyer setup failed'));
        dispatch(LogActions.error(JSON.stringify(err)));
      }

      try {
        await Segment.setup(SEGMENT_API_KEY, {
          recordScreenViews: false,
          trackAppLifecycleEvents: true,
          ios: {
            trackAdvertising: true,
          },
        });

        const {advertisingId} = await AdID.getAdvertisingId();
        Segment.setIDFA(advertisingId);

        if (appInit) {
          const {appFirstOpenData} = getState().APP;

          if (
            appFirstOpenData?.firstOpenDate &&
            !appFirstOpenData?.firstOpenEventComplete
          ) {
            dispatch(setAppFirstOpenEventComplete());
            dispatch(
              Analytics.track(
                'First Opened App',
                {
                  date: appFirstOpenData?.firstOpenDate || '',
                },
                true,
              ),
            );
          } else {
            dispatch(Analytics.track('Last Opened App', {}, true));
          }
        }
      } catch (err) {
        dispatch(LogActions.error('Segment setup failed'));
        dispatch(LogActions.error(JSON.stringify(err)));
      }
    }
  };

export const logSegmentEvent =
  (
    _eventType: 'track',
    eventName: string,
    eventProperties: JsonMap = {},
    includeAppUser: boolean = false,
  ): Effect<Promise<void>> =>
  (_dispatch, getState) => {
    if (APP_ANALYTICS_ENABLED) {
      // TODO: always include userId if available?
      if (includeAppUser) {
        const {BITPAY_ID, APP} = getState();
        const user = BITPAY_ID.user[APP.network];
        eventProperties.userId = user?.eid || '';
      } else {
        eventProperties.userId = eventProperties.userId || '';
      }

      const eventOptions: Options = {
        integrations: {
          AppsFlyer: {
            appsFlyerId: APPSFLYER_APP_ID,
          },
        },
      };

      return Segment.track(
        `BitPay App - ${eventName}`,
        eventProperties,
        eventOptions,
      );
    }

    return Promise.resolve();
  };

export const Analytics = {
  /**
   * Makes a call to identify a user through the analytics SDK.
   *
   * @param user database ID (or email address) for this user.
   * If you don't have a userId but want to record traits, you should pass nil.
   * For more information on how we generate the UUID and Apple's policies on IDs, see https://segment.io/libraries/ios#ids
   * @param traits A dictionary of traits you know about the user. Things like: email, name, plan, etc.
   */
  identify:
    (user: string | null, traits?: JsonMap): Effect<Promise<void>> =>
    () => {
      if (APP_ANALYTICS_ENABLED) {
        const options: Options = {};

        return Segment.identify(user, traits, options);
      }

      return Promise.resolve();
    },

  /**
   * Makes a call to record a screen view through the analytics SDK.
   *
   * @param name The title of the screen being viewed.
   * @param properties A dictionary of properties for the screen view event.
   * If the event was 'Added to Shopping Cart', it might have properties like price, productType, etc.
   */
  screen:
    (name: string, properties: JsonMap = {}): Effect<Promise<void>> =>
    (_dispatch, getState) => {
      if (APP_ANALYTICS_ENABLED) {
        const {BITPAY_ID, APP} = getState();
        const user = BITPAY_ID.user[APP.network];
        properties.userId = user?.eid || '';

        const options: Options = {
          integrations: {
            AppsFlyer: {
              appsFlyerId: APPSFLYER_APP_ID,
            },
          },
        };

        return Segment.screen(name, properties, options);
      }

      return Promise.resolve();
    },

  /**
   * Record the actions your users perform through the analytics SDK.
   *
   * When a user performs an action in your app, you'll want to track that action for later analysis.
   * Use the event name to say what the user did, and properties to specify any interesting details of the action.
   *
   * @param event The name of the event you're tracking.
   * The SDK recommend using human-readable names like `Played a Song` or `Updated Status`.
   * @param properties A dictionary of properties for the event.
   * If the event was 'Added to Shopping Cart', it might have properties like price, productType, etc.
   * @param includeAppUser Whether or not the userId should also be submitted. TODO: always include userId if availiable?
   */
  track: (
    event: string,
    properties: JsonMap = {},
    includeAppUser: boolean = false,
  ) => {
    return logSegmentEvent('track', event, properties, includeAppUser);
  },
};

export const subscribePushNotifications =
  (walletClient: any, eid: string): Effect<Promise<void>> =>
  async dispatch => {
    const opts = {
      externalUserId: eid,
      platform: Platform.OS,
      packageName: 'BitPay',
      walletId: walletClient.credentials.walletId,
    };
    walletClient.pushNotificationsSubscribe(opts, (err: any) => {
      if (err) {
        dispatch(
          LogActions.error(
            'Push Notifications error subscribing: ' + JSON.stringify(err),
          ),
        );
      } else {
        dispatch(
          LogActions.info(
            'Push Notifications success subscribing: ' +
              walletClient.credentials.walletName,
          ),
        );
      }
    });
  };

export const unSubscribePushNotifications =
  (walletClient: any, eid: string): Effect<Promise<void>> =>
  async dispatch => {
    walletClient.pushNotificationsUnsubscribe(eid, (err: any) => {
      if (err) {
        dispatch(
          LogActions.error(
            'Push Notifications error unsubscribing: ' + JSON.stringify(err),
          ),
        );
      } else {
        dispatch(
          LogActions.info(
            'Push Notifications success unsubscribing: ' +
              walletClient.credentials.walletName,
          ),
        );
      }
    });
  };

export const checkNotificationsPermissions = (): Promise<boolean> => {
  return new Promise(async resolve => {
    checkNotifications().then(({status}) => {
      if (status === RESULTS.GRANTED) {
        return resolve(true);
      } else {
        return resolve(false);
      }
    });
  });
};

export const setNotifications =
  (accepted: boolean): Effect =>
  (dispatch, getState) => {
    dispatch(setNotificationsAccepted(accepted));
    const value = accepted
      ? ReactAppboy.NotificationSubscriptionTypes.SUBSCRIBED
      : ReactAppboy.NotificationSubscriptionTypes.UNSUBSCRIBED;

    ReactAppboy.setPushNotificationSubscriptionType(value);
    const {
      WALLET: {keys},
      APP,
    } = getState();

    getAllWalletClients(keys).then(walletClients => {
      if (accepted) {
        walletClients.forEach(walletClient => {
          dispatch(subscribePushNotifications(walletClient, APP.brazeEid!));
        });
      } else {
        walletClients.forEach(walletClient => {
          dispatch(unSubscribePushNotifications(walletClient, APP.brazeEid!));
        });
      }
      dispatch(LogActions.info('Push Notifications: ' + value));
    });
  };

export const setConfirmTxNotifications =
  (accepted: boolean): Effect =>
  async dispatch => {
    dispatch(setConfirmedTxAccepted(accepted));
  };

export const setProductsUpdatesNotifications =
  (accepted: boolean): Effect =>
  async dispatch => {
    dispatch(setProductsUpdatesAccepted(accepted));
    if (accepted) {
      ReactAppboy.addToSubscriptionGroup(PRODUCTS_UPDATES_GROUP_ID);
    } else {
      ReactAppboy.removeFromSubscriptionGroup(PRODUCTS_UPDATES_GROUP_ID);
    }
  };

export const setOffersAndPromotionsNotifications =
  (accepted: boolean): Effect =>
  async dispatch => {
    dispatch(setOffersAndPromotionsAccepted(accepted));
    if (accepted) {
      ReactAppboy.addToSubscriptionGroup(OFFERS_AND_PROMOTIONS_GROUP_ID);
    } else {
      ReactAppboy.removeFromSubscriptionGroup(OFFERS_AND_PROMOTIONS_GROUP_ID);
    }
  };

export const handleBwsEvent =
  (response: SilentPushEvent): Effect =>
  async (dispatch, getState) => {
    const {
      WALLET: {keys},
    } = getState();
    if (response && response.walletId) {
      const {wallet, keyId} = await findWalletByIdHashed(
        keys,
        response.walletId,
        response.tokenAddress,
      );
      if (!wallet || !keyId) {
        return;
      }

      if (
        !wallet.credentials.walletId &&
        response.notification_type !== 'NewBlock'
      ) {
        return;
      }
      console.log(
        '#### wallet found! Sending Event...',
        wallet.credentials.walletId,
      );
      let walletId = wallet.credentials.walletId;
      if (response.tokenAddress) {
        walletId =
          wallet.credentials.walletId +
          '-' +
          response.tokenAddress.toLowerCase();
        console.log(`### event for token wallet: ${walletId}`);
      }

      // TODO showInappNotification(data);

      console.log(
        `BWS Event: ${response.notification_type}: `,
        JSON.stringify(response),
      );

      const keyObj = await findKeyByKeyId(keyId, keys);

      switch (response.notification_type) {
        case 'NewAddress':
          dispatch(createWalletAddress({wallet, newAddress: true}));
          break;
        case 'NewBlock':
          if (response.network && response.network === 'livenet') {
            dispatch(startUpdateAllKeyAndWalletStatus());
            DeviceEventEmitter.emit(DeviceEmitterEvents.WALLET_LOAD_HISTORY);
          }
          break;
        case 'TxProposalAcceptedBy':
        case 'TxProposalRejectedBy':
        case 'TxProposalRemoved':
          dispatch(startUpdateAllWalletStatusForKey({key: keyObj}));
          break;
        case 'NewOutgoingTx':
        case 'NewIncomingTx':
        case 'NewTxProposal':
        case 'TxConfirmation':
          dispatch(startUpdateWalletStatus({key: keyObj, wallet}));
          DeviceEventEmitter.emit(DeviceEmitterEvents.WALLET_LOAD_HISTORY);
          break;
      }
    }
  };

export const resetAllSettings = (): Effect => dispatch => {
  batch(() => {
    dispatch(AppActions.setColorScheme(null));
    dispatch(AppActions.showPortfolioValue(true));
    dispatch(
      AppActions.setDefaultAltCurrency({isoCode: 'USD', name: 'US Dollar'}),
    );
    dispatch(AppActions.setDefaultLanguage(i18n.language || 'en'));
    dispatch(WalletActions.setUseUnconfirmedFunds(false));
    dispatch(WalletActions.setCustomizeNonce(false));
    dispatch(WalletActions.setQueuedTransactions(false));
    dispatch(WalletActions.setEnableReplaceByFee(false));
    dispatch(LogActions.info('Reset all settings'));
  });
};
