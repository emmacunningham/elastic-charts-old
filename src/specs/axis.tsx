import { inject } from 'mobx-react';
import React from 'react';
import { AxisSpec as AxisSpecType, Position } from '../lib/series/specs';
import { getGroupId } from '../lib/utils/ids';
import { SpecProps } from './specs_parser';

type AxisSpecProps =
  SpecProps &
  AxisSpecType;

type DefaultProps =
  | 'groupId'
  | 'hide'
  | 'showOverlappingTicks'
  | 'showOverlappingLabels'
  | 'position'
  | 'tickSize'
  | 'tickPadding'
  | 'tickFormat';

class AxisSpec extends React.PureComponent<AxisSpecProps> {
  static defaultProps: Pick<AxisSpecProps, DefaultProps> = {
    groupId: getGroupId('__global__'),
    hide: false,
    showOverlappingTicks: false,
    showOverlappingLabels: false,
    position: Position.Left,
    tickSize: 10,
    tickPadding: 10,
    tickFormat: (tick: any) => `${tick}`,
  };
  componentDidMount() {
    const { chartStore, children, ...spec } = this.props;
    chartStore!.addAxisSpec({ ...spec });
  }
  componentDidUpdate() {
    const { chartStore, children, ...spec } = this.props;
    chartStore!.addAxisSpec({ ...spec });
  }
  componentWillUnmount() {
    const { id } = this.props;
    this.props.chartStore!.removeAxisSpec(id);
  }
  render() {
    return null;
  }
}

export const Axis = inject('chartStore')(AxisSpec);
