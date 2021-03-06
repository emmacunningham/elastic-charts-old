import { isVertical } from '../lib/axes/axis_utils';
import { CurveType } from '../lib/series/curves';
import { mergeXDomain, XDomain } from '../lib/series/domains/x_domain';
import { mergeYDomain, YDomain } from '../lib/series/domains/y_domain';
import {
  AreaGeometry,
  BarGeometry,
  LineGeometry,
  PointGeometry,
  renderArea,
  renderBars,
  renderLine,
  renderPoints,
} from '../lib/series/rendering';
import { computeXScale, computeYScales, countClusteredSeries } from '../lib/series/scales';
import {
  DataSeries,
  DataSeriesColorsValues,
  FormattedDataSeries,
  getFormattedDataseries,
  getSplittedSeries,
  RawDataSeries,
} from '../lib/series/series';
import { AreaSeriesSpec, AxisSpec, BasicSeriesSpec, LineSeriesSpec } from '../lib/series/specs';
import { ColorConfig } from '../lib/themes/theme';
import { Dimensions } from '../lib/utils/dimensions';
import { AxisId, GroupId, SpecId } from '../lib/utils/ids';
import { Scale } from '../lib/utils/scales/scales';

export function computeSeriesDomains(seriesSpecs: Map<SpecId, BasicSeriesSpec>): {
  xDomain: XDomain;
  yDomain: YDomain[];
  splittedDataSeries: RawDataSeries[][];
  formattedDataSeries: {
      stacked: FormattedDataSeries[];
      nonStacked: FormattedDataSeries[];
  };
  seriesColors: Map<string, DataSeriesColorsValues>;
} {
  const { splittedSeries, xValues, seriesColors } = getSplittedSeries(seriesSpecs);
  // tslint:disable-next-line:no-console
  // console.log({ splittedSeries, xValues, seriesColors });
  const splittedDataSeries = [...splittedSeries.values()];
  const specsArray = [...seriesSpecs.values()];
  const xDomain = mergeXDomain(specsArray, xValues);
  const yDomain = mergeYDomain(splittedSeries, specsArray);
  const formattedDataSeries = getFormattedDataseries(specsArray, splittedSeries);

  // console.log({ formattedDataSeries, xDomain, yDomain });

  return {
    xDomain,
    yDomain,
    splittedDataSeries,
    formattedDataSeries,
    seriesColors,
  };
}

export function computeSeriesGeometries(
  seriesSpecs: Map<SpecId, BasicSeriesSpec>,
  xDomain: XDomain,
  yDomain: YDomain[],
  formattedDataSeries: {
    stacked: FormattedDataSeries[];
    nonStacked: FormattedDataSeries[];
  },
  seriesColorMap: Map<string, string>,
  chartColors: ColorConfig,
  chartDims: Dimensions,
) {
  const { width, height } = chartDims;
  const { stacked, nonStacked } = formattedDataSeries;

  // compute how many series are clustered
  const { stackedGroupCount, totalGroupCount } = countClusteredSeries(stacked, nonStacked);

  // compute scales
  const xScale = computeXScale(xDomain, totalGroupCount, 0, width);
  const yScales = computeYScales(yDomain, height, 0);

  // compute colors

  // compute geometries
  const points: PointGeometry[] = [];
  const areas: AreaGeometry[] = [];
  const bars: BarGeometry[] = [];
  const lines: LineGeometry[] = [];
  let orderIndex = 0;
  formattedDataSeries.stacked.forEach((dataSeriesGroup, index) => {
    const { groupId, dataSeries, counts } = dataSeriesGroup;
    const yScale = yScales.get(groupId);
    if (!yScale) {
      return;
    }

    const geometries = renderGeometries(
      orderIndex,
      totalGroupCount,
      true,
      dataSeries,
      xScale,
      yScale,
      seriesSpecs,
      seriesColorMap,
      chartColors.defaultVizColor,
    );
    orderIndex = counts.barSeries > 0 ? orderIndex + 1 : orderIndex;
    areas.push(...geometries.areas);
    lines.push(...geometries.lines);
    bars.push(...geometries.bars);
    points.push(...geometries.points);

    // console.log(geometries);
  });
  formattedDataSeries.nonStacked.map((dataSeriesGroup, index) => {
    const { groupId, dataSeries } = dataSeriesGroup;
    const yScale = yScales.get(groupId);
    if (!yScale) {
      return;
    }
    const geometries = renderGeometries(
      stackedGroupCount,
      totalGroupCount,
      false,
      dataSeries,
      xScale,
      yScale,
      seriesSpecs,
      seriesColorMap,
      chartColors.defaultVizColor,
    );

    areas.push(...geometries.areas);
    lines.push(...geometries.lines);
    bars.push(...geometries.bars);
    points.push(...geometries.points);
  });
  return {
    points,
    areas,
    bars,
    lines,
  };
}

export function renderGeometries(
  indexOffset: number,
  clusteredCount: number,
  isStacked: boolean,
  dataSeries: DataSeries[],
  xScale: Scale,
  yScale: Scale,
  seriesSpecs: Map<SpecId, BasicSeriesSpec>,
  seriesColorsMap: Map<string, string>,
  defaultColor: string,
): {
  points: PointGeometry[];
  bars: BarGeometry[];
  areas: AreaGeometry[];
  lines: LineGeometry[];
} {
  const len = dataSeries.length;
  let i;
  const points = [];
  const bars = [];
  const areas = [];
  const lines = [];
  for (i = 0; i < len; i++) {
    const ds = dataSeries[i];
    const spec = getSpecById(seriesSpecs, ds.specId);
    if (spec === undefined) {
      continue;
    }
    const color = seriesColorsMap.get(ds.seriesColorKey) || defaultColor;
    switch (spec.seriesType) {
      case 'basic':
        const pointShift = clusteredCount > 0 ? clusteredCount : 1;

        const point = renderPoints(
          xScale.bandwidth * pointShift / 2,
          ds.data,
          xScale,
          yScale,
          color,
          ds.specId,
          ds.key,
        );
        points.push(...point);
        break;
      case 'bar':
        const shift = isStacked ? indexOffset : indexOffset + i;
        const bar = renderBars(shift, ds.data, xScale, yScale, color, ds.specId, ds.key);
        bars.push(...bar);
        break;
      case 'line':
        const lineShift = clusteredCount > 0 ? clusteredCount : 1;
        const line = renderLine(
          xScale.bandwidth * lineShift / 2,
          ds.data,
          xScale,
          yScale,
          color,
          (spec as LineSeriesSpec).curve || CurveType.LINEAR,
          ds.specId,
          ds.key,
        );
        lines.push(line);
        break;
      case 'area':
        const areaShift = clusteredCount > 0 ? clusteredCount : 1;
        const area = renderArea(
          xScale.bandwidth * areaShift / 2,
          ds.data,
          xScale,
          yScale,
          color,
          (spec as AreaSeriesSpec).curve || CurveType.LINEAR,
          ds.specId,
          ds.key,
        );
        areas.push(area);
        break;
    }
  }
  return {
    points,
    bars,
    areas,
    lines,
  };
}

export function getSpecById(seriesSpecs: Map<SpecId, BasicSeriesSpec>, specId: SpecId) {
  return seriesSpecs.get(specId);
}

export function getAxesSpecForSpecId(axesSpecs: Map<AxisId, AxisSpec>, groupId: GroupId) {
  let xAxis;
  let yAxis;
  for (const axisSpec of axesSpecs.values()) {
    if (axisSpec.groupId !== groupId) {
      continue;
    }
    if (isVertical(axisSpec.position)) {
      yAxis = axisSpec;
    } else {
      xAxis = axisSpec;
    }
  }
  return {
    xAxis,
    yAxis,
  };
}
