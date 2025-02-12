import {yupResolver} from '@hookform/resolvers/yup';
import {StackScreenProps} from '@react-navigation/stack';
import React, {useEffect} from 'react';
import {Controller, useForm} from 'react-hook-form';
import {useTranslation} from 'react-i18next';
import {useDispatch, useSelector} from 'react-redux';
import * as yup from 'yup';
import Button from '../../../components/button/Button';
import BoxInput from '../../../components/form/BoxInput';
import {RootState} from '../../../store';
import {AppActions} from '../../../store/app';
import {BitPayIdActions, BitPayIdEffects} from '../../../store/bitpay-id';
import {TwoFactorAuthStatus} from '../../../store/bitpay-id/bitpay-id.reducer';
import {AuthStackParamList} from '../AuthStack';
import AuthFormContainer, {
  AuthActionsContainer,
  AuthFormParagraph,
  AuthRowContainer,
} from '../components/AuthFormContainer';

export type TwoFactorAuthenticationParamList =
  | {
      onLoginSuccess?: ((...args: any[]) => any) | undefined;
    }
  | undefined;

type TwoFactorAuthenticationScreenProps = StackScreenProps<
  AuthStackParamList,
  'TwoFactorAuthentication'
>;

interface TwoFactorAuthFieldValues {
  code: string;
}

const schema = yup.object().shape({
  code: yup.string().required('Required'),
});

const TwoFactorAuthentication: React.FC<
  TwoFactorAuthenticationScreenProps
> = props => {
  const {t} = useTranslation();
  const {navigation, route} = props;
  const {onLoginSuccess} = route.params || {};
  const dispatch = useDispatch();
  const twoFactorAuthStatus = useSelector<RootState, TwoFactorAuthStatus>(
    ({BITPAY_ID}) => BITPAY_ID.twoFactorAuthStatus,
  );
  const twoFactorAuthError = useSelector<RootState, string>(
    ({BITPAY_ID}) => BITPAY_ID.twoFactorAuthError || '',
  );
  const {
    control,
    formState: {errors, isValid},
    handleSubmit,
    getValues,
    resetField,
  } = useForm<TwoFactorAuthFieldValues>({
    resolver: yupResolver(schema),
    mode: 'onChange',
  });

  useEffect(() => {
    return () => {
      dispatch(BitPayIdActions.updateTwoFactorAuthStatus(null));
    };
  }, [dispatch]);

  useEffect(() => {
    switch (twoFactorAuthStatus) {
      case 'success':
        const {code} = getValues();
        resetField('code');
        navigation.navigate('TwoFactorPairing', {
          prevCode: code,
          onLoginSuccess,
        });

        return;

      case 'failed':
        dispatch(
          AppActions.showBottomNotificationModal({
            type: 'error',
            title: t('Login failed'),
            message: twoFactorAuthError || t('An unexpected error occurred.'),
            enableBackdropDismiss: false,
            actions: [
              {
                text: t('OK'),
                action: () => {
                  dispatch(BitPayIdActions.updateTwoFactorAuthStatus(null));
                },
              },
            ],
          }),
        );
        return;
    }
  }, [
    dispatch,
    resetField,
    getValues,
    navigation,
    twoFactorAuthStatus,
    twoFactorAuthError,
    t,
    onLoginSuccess,
  ]);

  const onSubmit = handleSubmit(({code}) => {
    if (!code) {
      return;
    }

    dispatch(BitPayIdEffects.startTwoFactorAuth(code));
  });

  return (
    <AuthFormContainer>
      <AuthFormParagraph>
        {t('Enter the code generated by your authenticator app.')}
      </AuthFormParagraph>

      <AuthRowContainer>
        <Controller
          control={control}
          render={({field: {onChange, onBlur, value}}) => (
            <BoxInput
              placeholder={'eg. 123456'}
              label={t('Code')}
              onBlur={onBlur}
              onChangeText={onChange}
              error={errors.code?.message}
              value={value}
              keyboardType="numeric"
              onSubmitEditing={onSubmit}
            />
          )}
          name="code"
          defaultValue=""
        />
      </AuthRowContainer>

      <AuthActionsContainer>
        <Button onPress={onSubmit} disabled={!isValid}>
          {t('Submit')}
        </Button>
      </AuthActionsContainer>
    </AuthFormContainer>
  );
};

export default TwoFactorAuthentication;
