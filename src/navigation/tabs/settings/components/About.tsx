import React from 'react';
import {SettingsComponent} from '../SettingsRoot';
import {
  ActiveOpacity,
  Hr,
  Setting,
  SettingTitle,
} from '../../../../components/styled/Containers';
import Button from '../../../../components/button/Button';
// @ts-ignore
import {version} from '../../../../../package.json'; // TODO: better way to get version
import {useNavigation} from '@react-navigation/native';
import {URL} from '../../../../constants';
import {useTranslation} from 'react-i18next';
import {View} from 'react-native';
import {useDispatch} from 'react-redux';
import {
  logSegmentEvent,
  openUrlWithInAppBrowser,
} from '../../../../store/app/app.effects';
import AngleRight from '../../../../../assets/img/angle-right.svg';
import {GIT_COMMIT_HASH} from '@env';

interface LinkSetting {
  key: string;
  title: string;
  link: string;
}

const About = () => {
  const navigation = useNavigation();
  const {t} = useTranslation();
  const dispatch = useDispatch();

  const LINKS: LinkSetting[] = [
    {
      key: 'HelpAndSupport',
      title: t('Help & Support'),
      link: URL.HELP_AND_SUPPORT,
    },
    {
      key: 'TermsOfUse',
      title: t('Terms of Use'),
      link: URL.TOU_WALLET,
    },
    {
      key: 'Privacy',
      title: t('Privacy'),
      link: URL.PRIVACY_POLICY,
    },
    {
      key: 'AccessibilityStatement',
      title: t('Accessibility Statement'),
      link: URL.ACCESSIBILITY_STATEMENT,
    },
  ];
  return (
    <SettingsComponent style={{marginBottom: 10}}>
      <Setting>
        <SettingTitle>{t('Version')}</SettingTitle>

        <Button buttonType="pill">{version}</Button>
      </Setting>

      <Hr />

      {GIT_COMMIT_HASH ? (
        <>
          <Setting>
            <SettingTitle>{t('Commit Hash')}</SettingTitle>

            <Button buttonType="pill">{GIT_COMMIT_HASH}</Button>
          </Setting>
          <Hr />
        </>
      ) : null}

      <Setting
        onPress={() => navigation.navigate('About', {screen: 'SessionLogs'})}>
        <SettingTitle>{t('Session Log')}</SettingTitle>
        <AngleRight />
      </Setting>

      <Hr />

      <Setting
        onPress={() => navigation.navigate('About', {screen: 'SendFeedback'})}>
        <SettingTitle>{t('Send Feedback')}</SettingTitle>
        <AngleRight />
      </Setting>

      <Hr />
      {LINKS.map(({key, title, link}, index) => {
        return (
          <View key={key}>
            <Setting
              activeOpacity={ActiveOpacity}
              onPress={() => {
                dispatch(
                  logSegmentEvent(
                    'track',
                    'Clicked About BitPay Link',
                    {
                      key,
                    },
                    true,
                  ),
                );
                dispatch(openUrlWithInAppBrowser(link));
              }}>
              <SettingTitle>{title}</SettingTitle>
            </Setting>
            {LINKS.length - 1 !== index && <Hr />}
          </View>
        );
      })}
    </SettingsComponent>
  );
};
export default About;
