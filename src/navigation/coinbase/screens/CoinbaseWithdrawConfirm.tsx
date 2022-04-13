import React, {useState, useEffect, useCallback} from 'react';
import {Alert} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import {RouteProp} from '@react-navigation/core';
import {useAppDispatch, useAppSelector} from '../../../utils/hooks';
import {Wallet} from '../../../store/wallet/wallet.models';
import SwipeButton from '../../../components/swipe-button/SwipeButton';
import PaymentSent from '../../wallet/components/PaymentSent';
import {showBottomNotificationModal} from '../../../store/app/app.actions';
import {
  Amount,
  ConfirmContainer,
  DetailsList,
  Header,
  SendingFrom,
  SendingTo,
} from '../../wallet/screens/send/confirm/Shared';
import {CoinbaseStackParamList} from '../CoinbaseStack';
import {COINBASE_ENV} from '../../../api/coinbase/coinbase.constants';
import {find} from 'lodash';
import {
  coinbaseGetFiatAmount,
  coinbaseSendTransaction,
  coinbaseParseErrorToString,
  coinbaseClearSendTransactionStatus,
} from '../../../store/coinbase';
import {CoinbaseErrorsProps} from '../../../api/coinbase/coinbase.types';
import {createWalletAddress} from '../../../store/wallet/effects/address/address';

export interface CoinbaseWithdrawConfirmParamList {
  accountId: string;
  wallet: Wallet | undefined;
  amount: number;
}

const CoinbaseWithdrawConfirm = () => {
  const dispatch = useAppDispatch();
  const navigation = useNavigation();
  const route =
    useRoute<RouteProp<CoinbaseStackParamList, 'CoinbaseWithdraw'>>();
  const {accountId, wallet, amount} = route.params;
  const [showPaymentSentModal, setShowPaymentSentModal] = useState(false);
  const [resetSwipeButton, setResetSwipeButton] = useState(false);

  const [receiveAddress, setReceiveAddress] = useState('');

  const accountData = useAppSelector(({COINBASE}) => {
    return find(COINBASE.accounts[COINBASE_ENV], {id: accountId});
  });
  const exchangeRates = useAppSelector(({COINBASE}) => COINBASE.exchangeRates);

  const sendStatus = useAppSelector(
    ({COINBASE}) => COINBASE.sendTransactionStatus,
  );

  const sendError = useAppSelector(
    ({COINBASE}) => COINBASE.sendTransactionError,
  );

  const apiLoading = useAppSelector(({COINBASE}) => COINBASE.isApiLoading);

  const currency = wallet?.credentials.coin;

  const recipientData = {
    recipientName: wallet?.credentials.walletName || 'BitPay Wallet',
    recipientAddress: receiveAddress,
    img: wallet?.img || wallet?.credentials.coin,
  };

  const sendingFrom = {
    walletName: accountData?.name || 'Coinbase Account',
    img: 'coinbase',
  };

  const fiatAmountValue = coinbaseGetFiatAmount(
    amount,
    currency.toUpperCase(),
    exchangeRates,
  );

  const total = {
    cryptoAmount: amount + ' ' + currency.toUpperCase(),
    fiatAmount: fiatAmountValue.toFixed(2) + ' USD',
  };

  useEffect(() => {
    if (!resetSwipeButton) {
      return;
    }
    const timer = setTimeout(() => {
      setResetSwipeButton(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [resetSwipeButton]);

  const sendTransaction = useCallback(
    async (code?: string) => {
      const buildTx = {
        to: receiveAddress,
        amount: amount,
        currency: currency,
      };
      dispatch(coinbaseSendTransaction(accountId, buildTx, code));
    },
    [dispatch, accountId, receiveAddress, amount, currency],
  );

  const showError = useCallback(
    (error: CoinbaseErrorsProps | null) => {
      const errMsg = coinbaseParseErrorToString(error);
      dispatch(
        showBottomNotificationModal({
          type: 'error',
          title: 'Error Sending Transaction',
          message: errMsg,
          enableBackdropDismiss: false,
          actions: [
            {
              text: 'OK',
              action: () => {
                dispatch(coinbaseClearSendTransactionStatus());
                navigation.goBack();
              },
              primary: true,
            },
          ],
        }),
      );
    },
    [dispatch, navigation],
  );

  const askForTwoFactor = useCallback(() => {
    Alert.prompt(
      'Enter 2FA code',
      'Two Factor verification code is required for sending this transaction.',
      [
        {
          text: 'Cancel',
          onPress: () => {
            showError(sendError);
          },
          style: 'cancel',
        },
        {
          text: 'OK',
          onPress: code => {
            dispatch(coinbaseClearSendTransactionStatus());
            sendTransaction(code);
          },
        },
      ],
      'secure-text',
      '',
      'number-pad',
    );
  }, [dispatch, showError, sendError, sendTransaction]);

  const generateReceiveAddress = useCallback(
    async (newWallet?: Wallet) => {
      if (newWallet) {
        const address = await dispatch(
          createWalletAddress({wallet: newWallet, newAddress: false}),
        );
        setReceiveAddress(address);
      }
    },
    [dispatch],
  );

  useEffect(() => {
    if (!apiLoading && sendStatus === 'failed') {
      if (sendError?.errors[0].id === 'two_factor_required') {
        askForTwoFactor();
      } else {
        showError(sendError);
      }
    }

    if (!apiLoading && sendStatus === 'success') {
      setShowPaymentSentModal(true);
    }

    if (wallet && wallet.receiveAddress) {
      setReceiveAddress(wallet.receiveAddress);
    } else {
      generateReceiveAddress(wallet);
    }
  }, [
    apiLoading,
    sendStatus,
    sendError,
    showError,
    askForTwoFactor,
    generateReceiveAddress,
    wallet,
  ]);

  return (
    <ConfirmContainer>
      <DetailsList>
        <Header>Summary</Header>
        <SendingTo recipient={recipientData} hr />
        <SendingFrom sender={sendingFrom} hr />
        <Amount description={'Total'} amount={total} />
      </DetailsList>

      <SwipeButton
        title={'Slide to withdraw'}
        forceReset={resetSwipeButton}
        onSwipeComplete={sendTransaction}
      />

      <PaymentSent
        isVisible={showPaymentSentModal}
        onCloseModal={async () => {
          dispatch(coinbaseClearSendTransactionStatus());
          setShowPaymentSentModal(false);
          navigation.goBack();
        }}
      />
    </ConfirmContainer>
  );
};

export default CoinbaseWithdrawConfirm;
