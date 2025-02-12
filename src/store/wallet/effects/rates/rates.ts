import {Effect} from '../../../index';
import axios from 'axios';
import {BASE_BWS_URL} from '../../../../constants/config';
import {SUPPORTED_COINS} from '../../../../constants/currencies';
import {
  DateRanges,
  HistoricRate,
  PriceHistory,
  Rate,
  Rates,
} from '../../wallet.models';
import {isCacheKeyStale} from '../../utils/wallet';
import {
  DEFAULT_DATE_RANGE,
  HISTORIC_RATES_CACHE_DURATION,
  RATES_CACHE_DURATION,
} from '../../../../constants/wallet';
import {
  failedGetPriceHistory,
  failedGetRates,
  successGetPriceHistory,
  successGetRates,
  updateCacheKey,
} from '../../wallet.actions';
import {CacheKeys} from '../../wallet.models';
import moment from 'moment';
import {addAltCurrencyList} from '../../../app/app.actions';
import {AltCurrenciesRowProps} from '../../../../components/list/AltCurrenciesRow';
import {LogActions} from '../../../log';
import {BitpaySupportedTokenOptsByAddress} from '../../../../constants/tokens';

export const getPriceHistory =
  (defaultAltCurrencyIsoCode: string): Effect =>
  async dispatch => {
    try {
      const coinsList = SUPPORTED_COINS.map(
        coin =>
          `${coin.toUpperCase()}:${defaultAltCurrencyIsoCode.toUpperCase()}`,
      )
        .toString()
        .split(',')
        .join('","');
      const {
        data: {data},
      } = await axios.get(
        `https://bitpay.com/currencies/prices?currencyPairs=["${coinsList}"]`,
      );
      const formattedData = data
        .filter((d: PriceHistory) => d)
        .map((d: PriceHistory) => {
          return {
            ...d,
            coin: d?.currencyPair.split(':')[0].toLowerCase(),
          };
        });
      dispatch(successGetPriceHistory(formattedData));
    } catch (err) {
      console.error(err);
      dispatch(failedGetPriceHistory());
    }
  };

export const startGetRates =
  ({init, force}: {init?: boolean; force?: boolean}): Effect<Promise<Rates>> =>
  async (dispatch, getState) => {
    return new Promise(async (resolve, reject) => {
      const {
        WALLET: {ratesCacheKey, rates: cachedRates},
      } = getState();
      if (
        !isCacheKeyStale(
          ratesCacheKey[DEFAULT_DATE_RANGE],
          RATES_CACHE_DURATION,
        ) &&
        !force
      ) {
        console.log('Rates - using cached rates');
        return resolve(cachedRates);
      }

      dispatch(updateCacheKey({cacheKey: CacheKeys.RATES}));

      try {
        console.log('Rates - fetching new rates');

        const {tokenRates, tokenLastDayRates} = (await dispatch<any>(
          getTokenRates(),
        )) as any;

        const yesterday =
          moment().subtract(1, 'days').startOf('hour').unix() * 1000;
        const {data: rates} = await axios.get(`${BASE_BWS_URL}/v3/fiatrates/`);
        const {data: lastDayRates} = await axios.get(
          `${BASE_BWS_URL}/v3/fiatrates?ts=${yesterday}`,
        );
        if (init) {
          // set alternative currency list
          const alternatives: Array<AltCurrenciesRowProps> = [];
          rates.btc.forEach((r: Rate) => {
            if (r.code && r.name) {
              alternatives.push({isoCode: r.code, name: r.name});
            }
          });
          alternatives.sort((a, b) => (a.name < b.name ? -1 : 1));
          dispatch(addAltCurrencyList(alternatives));
        }

        const allRates = {...rates, ...tokenRates};
        const allLastDayRates = {...lastDayRates, ...tokenLastDayRates};

        dispatch(
          successGetRates({
            rates: allRates,
            lastDayRates: allLastDayRates,
            ratesByDateRange: rates,
          }),
        );
        resolve(allRates);
      } catch (err) {
        console.error(err);
        dispatch(failedGetRates());
        reject();
      }
    });
  };

export const getContractAddresses =
  (): Effect<Array<string | undefined>> => (_dispatch, getState) => {
    const {
      WALLET: {keys},
    } = getState();
    let allTokenAddresses: string[] = [];

    Object.values(keys).forEach(key => {
      key.wallets.forEach(wallet => {
        if (wallet.currencyAbbreviation === 'eth' && wallet.tokens) {
          const tokenAddresses = wallet.tokens.map(t =>
            t.replace(`${wallet.id}-`, ''),
          );
          allTokenAddresses.push(...tokenAddresses);
        }
      });
    });

    return allTokenAddresses;
  };

export const getTokenRates =
  (): Effect<
    Promise<{tokenRates: Rates; tokenLastDayRates: Rates} | undefined>
  > =>
  (dispatch, getState) => {
    return new Promise(async resolve => {
      let tokenRates: {[key in string]: any} = {};
      let tokenLastDayRates: {[key in string]: any} = {};

      try {
        const {
          APP: {altCurrencyList},
          WALLET: {tokenOptionsByAddress, customTokenOptionsByAddress},
        } = getState();

        const tokens = {
          ...BitpaySupportedTokenOptsByAddress,
          ...tokenOptionsByAddress,
          ...customTokenOptionsByAddress,
        };
        const altCurrencies = altCurrencyList.map(altCurrency =>
          altCurrency.isoCode.toLowerCase(),
        );
        const contractAddresses = dispatch(getContractAddresses());

        const url = `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${contractAddresses.join(
          ',',
        )}&vs_currencies=${altCurrencies.join(
          ',',
        )}&include_24hr_change=true&include_last_updated_at=true`;
        const {data} = await axios.get(url);

        Object.entries(data).map(([key, value]: [string, any]) => {
          const tokenName = tokens[key].symbol.toLowerCase();
          tokenRates[tokenName] = [];
          tokenLastDayRates[tokenName] = [];

          altCurrencies.forEach(altCurrency => {
            tokenRates[tokenName].push({
              code: altCurrency.toUpperCase(),
              fetchedOn: value.last_updated_at,
              name: tokenName,
              rate: value[altCurrency],
              ts: value.last_updated_at,
            });

            const yesterday = moment
              .unix(value.last_updated_at)
              .subtract(1, 'days')
              .unix();
            tokenLastDayRates[tokenName].push({
              code: altCurrency.toUpperCase(),
              fetchedOn: yesterday,
              name: tokenName,
              rate:
                value[altCurrency] +
                (value[altCurrency] * value[`${altCurrency}_24h_change`]) / 100,
              ts: yesterday,
            });
          });
        });

        resolve({tokenRates, tokenLastDayRates});
      } catch (e) {
        dispatch(
          LogActions.error(
            '[getTokenRates]: an error occurred while fetching token rates from coingecko.',
          ),
        );
        resolve({tokenRates, tokenLastDayRates}); // prevent the app from crashing if coingecko fails
      }
    });
  };

export const getHistoricFiatRate = (
  fiatCode: string,
  currencyAbbreviation: string,
  ts: string,
): Promise<HistoricRate> => {
  return new Promise(async (resolve, reject) => {
    try {
      const url = `${BASE_BWS_URL}/v1/fiatrates/${fiatCode}?coin=${currencyAbbreviation}&ts=${ts}`;
      const {data} = await axios.get(url);
      resolve(data);
    } catch (e) {
      reject(e);
    }
  });
};

export const fetchHistoricalRates =
  (
    dateRange: DateRanges = DateRanges.Day,
    currencyAbbreviation?: string,
    fiatIsoCode: string = 'USD',
  ): Effect<Promise<Array<number>>> =>
  async (dispatch, getState) => {
    return new Promise(async (resolve, reject) => {
      const {
        WALLET: {ratesCacheKey, ratesByDateRange: cachedRates},
      } = getState();

      if (
        !isCacheKeyStale(
          ratesCacheKey[dateRange],
          HISTORIC_RATES_CACHE_DURATION,
        )
      ) {
        dispatch(LogActions.info('[rates]: using cached rates'));
        const cachedRatesByCoin: Array<number> = currencyAbbreviation
          ? cachedRates[dateRange][currencyAbbreviation.toLowerCase()].map(
              (r: Rate) => {
                return r.rate;
              },
            )
          : [];

        return resolve(cachedRatesByCoin);
      }

      dispatch(updateCacheKey({cacheKey: CacheKeys.RATES}));

      try {
        dispatch(
          LogActions.info(
            `[rates]: fetching historical rates for ${fiatIsoCode} period ${dateRange}`,
          ),
        );
        const firstDateTs =
          moment().subtract(dateRange, 'days').startOf('hour').unix() * 1000;

        // This pulls ALL coins in one query
        const url = `${BASE_BWS_URL}/v2/fiatrates/${fiatIsoCode}?ts=${firstDateTs}`;
        const {data: rates} = await axios.get(url);
        dispatch(successGetRates({ratesByDateRange: rates, dateRange}));
        dispatch(
          LogActions.info('[rates]: fetched historical rates successfully'),
        );

        const ratesByCoin: Array<number> = currencyAbbreviation
          ? rates[currencyAbbreviation.toLowerCase()].map((r: Rate) => {
              return r.rate;
            })
          : [];
        resolve(ratesByCoin);
      } catch (e) {
        dispatch(
          LogActions.error(
            '[rates]: an error occurred while fetching historical rates.',
          ),
        );
        reject(e);
      }
    });
  };
