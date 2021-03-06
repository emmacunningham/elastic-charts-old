import { inject } from 'mobx-react';
import React from 'react';
import { LineSeriesSpec } from '../lib/series/specs';
import { getGroupId } from '../lib/utils/ids';
import { ScaleType } from '../lib/utils/scales/scales';
import { SpecProps } from './specs_parser';

type LineSpecProps = SpecProps & LineSeriesSpec;

type DefaultProps =
  | 'seriesType'
  | 'groupId'
  | 'xScaleType'
  | 'yScaleType'
  | 'xAccessor'
  | 'yAccessors'
  | 'yScaleToDataExtent';

export class LineSeriesSpecComponent extends React.PureComponent<LineSpecProps> {
  static defaultProps: Pick<LineSpecProps, DefaultProps> = {
    seriesType: 'line',
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

export const LineSeries = inject('chartStore')(LineSeriesSpecComponent);
