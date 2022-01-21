import styled from 'styled-components/native';
import {SlateDark} from '../../../../styles/colors';
import {BaseText} from '../../../../components/styled/Text';

export const BuyCryptoItemCard = styled.View`
  border: 1px solid #eaeaea;
  border-radius: 9px;
  margin: 20px 15px;
  padding: 14px;
`;

export const BuyCryptoExpandibleCard = styled.TouchableOpacity`
  border: 1px solid #eaeaea;
  border-radius: 9px;
  margin: 20px 15px 0px 15px;
  padding: 14px;
`;

export const ActionsContainer = styled.TouchableOpacity`
  display: flex;
  justify-content: space-between;
  flex-direction: row;
  align-items: center;
`;

export const SelectedOptionContainer = styled.View`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  height: 40px;
  padding: 0px 14px;
  background: #f5f7f8;
  border-radius: 12px;
`;

export const SelectedOptionText = styled(BaseText)`
  color: ${SlateDark};
  font-size: 16px;
  font-weight: 500;
`;

export const DataText = styled(BaseText)`
  color: ${SlateDark};
  font-size: 26px;
`;

export const CoinIconContainer = styled.View`
  width: 40px;
  height: 25px;
  display: flex;
  flex-direction: row;
  align-items: center;
`;

export const ItemDivisor = styled.View`
  border-bottom-color: ${({theme: {dark}}) => (dark ? SlateDark : '#ebecee')};
  border-bottom-width: 1px;
`;

export const BuyCryptoItemTitle = styled.Text`
  margin: 0 0 18px 0;
  color: #434d5a;
  line-height: 18px;
`;
