import { inject } from 'mobx-react';
import React from 'react';
import { BarSeriesSpec } from '../lib/series/specs';
import { getGroupId } from '../lib/utils/ids';
import { ScaleType } from '../lib/utils/scales/scales';
import { SpecProps } from './specs_parser';

type BarSpecProps = SpecProps & BarSeriesSpec;

type DefaultProps =
  | 'seriesType'
  | 'groupId'
  | 'xScaleType'
  | 'yScaleType'
  | 'xAccessor'
  | 'yAccessors'
  | 'yScaleToDataExtent';

export class BarSeriesSpecComponent extends React.PureComponent<BarSpecProps> {
  static defaultProps: Pick<BarSpecProps, DefaultProps> = {
    seriesType: 'bar',
    groupId: getGroupId('__global__'),
    xScaleType: ScaleType.Ordinal,
    yScaleType: ScaleType.Linear,
    xAccessor: 'x',
    yAccessors: ['y'],
    yScaleToDataExtent: false,
  };
  componentDidMount() {
    const { chartStore, children, ...config } = this.props;
    chartStore!.addSeriesSpec({ ...config });
  }
  componentDidUpdate() {
    const { chartStore, children, ...config } = this.props;
    chartStore!.addSeriesSpec({ ...config });
  }
  componentWillUnmount() {
    const { chartStore, id } = this.props;
    chartStore!.removeSeriesSpec(id);
  }
  render() {
    return null;
  }
}

export const BarSeries = inject('chartStore')(BarSeriesSpecComponent);
