import {Effect} from '../../../index';
import {BwcProvider} from '../../../../lib/bwc';
import merge from 'lodash.merge';
import {buildKeyObj, buildWalletObj} from '../../utils/wallet';
import {successCreateKey, successAddWallet} from '../../wallet.actions';
import {Key, KeyOptions, Wallet} from '../../wallet.models';
import {createWalletWithOpts} from '../create/create';
import {subscribePushNotifications} from '../../../app/app.effects';

const BWC = BwcProvider.getInstance();

export const startCreateKeyMultisig =
  (opts: Partial<KeyOptions>): Effect =>
  async (dispatch, getState): Promise<Key> => {
    return new Promise(async (resolve, reject) => {
      try {
        const {
          APP: {notificationsAccepted, brazeEid},
        } = getState();

        const _key = BWC.createKey({
          seedType: 'new',
        });

        const _wallet = await createWalletWithOpts({key: _key, opts});

        // subscribe new wallet to push notifications
        if (notificationsAccepted) {
          dispatch(subscribePushNotifications(_wallet, brazeEid!));
        }

        // build out app specific props
        const wallet = merge(
          _wallet,
          dispatch(buildWalletObj(_wallet.credentials)),
        ) as Wallet;

        const key = buildKeyObj({key: _key, wallets: [wallet]});

        dispatch(
          successCreateKey({
            key,
          }),
        );

        resolve(key);
      } catch (err) {
        console.error(err);
        reject();
      }
    });
  };

export const addWalletMultisig =
  ({key, opts}: {key: Key; opts: Partial<KeyOptions>}): Effect =>
  async (dispatch, getState): Promise<Wallet> => {
    return new Promise(async (resolve, reject) => {
      try {
        const {
          APP: {notificationsAccepted, brazeEid},
        } = getState();
        const newWallet = (await createWalletWithOpts({
          key: key.methods,
          opts,
        })) as Wallet;

        // subscribe new wallet to push notifications
        if (notificationsAccepted) {
          dispatch(subscribePushNotifications(newWallet, brazeEid!));
        }

        key.wallets.push(
          merge(
            newWallet,
            dispatch(buildWalletObj(newWallet.credentials)),
          ) as Wallet,
        );

        dispatch(successAddWallet({key}));

        resolve(newWallet);
      } catch (err) {
        console.error(err);
        reject(err);
      }
    });
  };
