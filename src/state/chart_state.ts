import { action, observable } from 'mobx';
import {
  AxisTick,
  AxisTicksDimensions,
  computeAxisTicksDimensions,
  getAxisTicksPositions,
} from '../lib/axes/axis_utils';
import { CanvasTextBBoxCalculator } from '../lib/axes/canvas_text_bbox_calculator';
import { computeLegend, LegendItem } from '../lib/series/legend';
import { AreaGeometry, BarGeometry, GeometryValue, LineGeometry, PointGeometry } from '../lib/series/rendering';
import { countClusteredSeries } from '../lib/series/scales';
import { getSeriesColorMap } from '../lib/series/series';
import {
  AreaSeriesSpec,
  AxisSpec,
  BarSeriesSpec,
  BasicSeriesSpec,
  LineSeriesSpec,
  Position,
  Rendering,
  Rotation,
} from '../lib/series/specs';
import { formatTooltip } from '../lib/series/tooltip';
import { DEFAULT_THEME, Theme } from '../lib/themes/theme';
import { computeChartDimensions, Dimensions } from '../lib/utils/dimensions';
import { SpecDomains } from '../lib/utils/domain';
import { AxisId, SpecId } from '../lib/utils/ids';
import { computeSeriesDomains, computeSeriesGeometries, getAxesSpecForSpecId } from './utils';
export interface TooltipPosition {
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
}
export interface TooltipData {
  value: GeometryValue;
  position: TooltipPosition;
}
// const MAX_ANIMATABLE_GLYPHS = 500;

export class ChartStore {
  debug = false;
  specsInitialized = observable.box(false);
  initialized = observable.box(false);
  parentDimensions: Dimensions = {
    width: 0,
    height: 0,
    top: 0,
    left: 0,
  }; // updated from jsx
  chartDimensions: Dimensions = {
    width: 0,
    height: 0,
    top: 0,
    left: 0,
  }; // updated from jsx
  chartRotation: Rotation = 0; // updated from jsx
  chartRendering: Rendering = 'canvas'; // updated from jsx
  chartTheme: Theme = DEFAULT_THEME; // updated from jsx
  axesSpecs: Map<AxisId, AxisSpec> = new Map(); // readed from jsx
  axesTicksDimensions: Map<AxisId, AxisTicksDimensions> = new Map(); // computed
  axesPositions: Map<AxisId, Dimensions> = new Map(); // computed
  axesVisibleTicks: Map<AxisId, AxisTick[]> = new Map(); // computed
  axesTicks: Map<AxisId, AxisTick[]> = new Map(); // computed

  seriesSpecs: Map<SpecId, BasicSeriesSpec> = new Map(); // readed from jsx

  seriesSpecDomains: Map<SpecId, SpecDomains> = new Map(); // computed

  legendItems: LegendItem[] = [];

  tooltipData = observable.box<Array<[any, any]> | null>(null);
  tooltipPosition = observable.box<{x: number, y: number} | null>();
  showTooltip = observable.box(false);

  geometries: {
    points: PointGeometry[];
    bars: BarGeometry[];
    areas: AreaGeometry[];
    lines: LineGeometry[];
  } | null = null;

  animateData = false;
  /**
   * Define if the chart can be animated or not depending
   * on the global configuration and on the number of elements per series
   */
  canDataBeAnimated = false;

  showLegend = observable.box(false);
  legendCollapsed = observable.box(false);
  legendPosition: Position | undefined;
  toggleLegendCollapsed = action(() => {
    this.legendCollapsed.set(!this.legendCollapsed.get());
    this.computeChart();
  });
  onOverElement = action((tooltip: TooltipData) => {
    const { specId } = tooltip.value;
    const spec = this.seriesSpecs.get(specId);
    if (!spec) {
      return;
    }
    const { xAxis, yAxis } = getAxesSpecForSpecId(this.axesSpecs, spec.groupId);
    const formattedTooltip = formatTooltip(tooltip, spec, xAxis, yAxis);
    this.tooltipData.set(formattedTooltip);
    this.showTooltip.set(true);
    document.body.style.cursor = 'pointer';
  });

  onOutElement = action(() => {
    this.showTooltip.set(false);
    document.body.style.cursor = 'default';
  });

  setTooltipPosition = action((x: number, y: number) => {
    this.tooltipPosition.set({ x, y});
  });

  setShowLegend = action((showLegend: boolean) => {
    this.showLegend.set(showLegend);
  });

  updateParentDimensions(width: number, height: number, top: number, left: number) {
    let isChanged = false;
    if (width !== this.parentDimensions.width) {
      isChanged = true;
      this.parentDimensions.width = width;
    }
    if (height !== this.parentDimensions.height) {
      isChanged = true;
      this.parentDimensions.height = height;
    }
    if (top !== this.parentDimensions.top) {
      isChanged = true;
      this.parentDimensions.top = top;
    }
    if (left !== this.parentDimensions.left) {
      isChanged = true;
      this.parentDimensions.left = left;
    }
    if (isChanged) {
      this.computeChart();
    }
  }
  addSeriesSpec(seriesSpec: BasicSeriesSpec | LineSeriesSpec | AreaSeriesSpec | BarSeriesSpec) {
    this.seriesSpecs.set(seriesSpec.id, seriesSpec);
  }
  removeSeriesSpec(specId: SpecId) {
    this.seriesSpecs.delete(specId);
  }
  /**
   * Add an axis spec to the store
   * @param axisSpec an axis spec
   */
  addAxisSpec(axisSpec: AxisSpec) {
    this.axesSpecs.set(axisSpec.id, axisSpec);
  }
  removeAxisSpec(axisId: AxisId) {
    this.axesSpecs.delete(axisId);
  }

  computeChart() {
    this.initialized.set(false);
    // compute only if parent dimensions are computed
    if (this.parentDimensions.width === 0 || this.parentDimensions.height === 0) {
      return;
    }

    const seriesDomains = computeSeriesDomains(this.seriesSpecs);
    // tslint:disable-next-line:no-console
    // console.log({colors: seriesDomains.seriesColors});

    // tslint:disable-next-line:no-console
    // console.log({seriesDomains});
    const seriesColorMap = getSeriesColorMap(seriesDomains.seriesColors, this.chartTheme.colors);
    this.legendItems = computeLegend(
      seriesDomains.seriesColors,
      seriesColorMap,
      this.seriesSpecs,
      this.axesSpecs,
      this.chartTheme.colors.defaultVizColor,
    );
    // tslint:disable-next-line:no-console
    // console.log({legendItems: this.legendItems});

    const { xDomain, yDomain, formattedDataSeries: { stacked, nonStacked } } = seriesDomains;
    // compute how many series are clustered
    const { totalGroupCount } = countClusteredSeries(stacked, nonStacked);

    // compute axis dimensions
    const bboxCalculator = new CanvasTextBBoxCalculator();
    this.axesTicksDimensions.clear();
    this.axesSpecs.forEach((axisSpec) => {
      const { id } = axisSpec;
      const dimensions = computeAxisTicksDimensions(
        axisSpec,
        xDomain,
        yDomain,
        totalGroupCount,
        bboxCalculator,
        this.chartRotation,
      );
      if (dimensions) {
        this.axesTicksDimensions.set(id, dimensions);
      }
    });
    bboxCalculator.destroy();

    // // compute chart dimensions
    this.chartDimensions = computeChartDimensions(
      this.parentDimensions,
      this.chartTheme.chart.margins,
      this.chartTheme.chart.paddings,
      this.chartTheme.legend,
      this.axesTicksDimensions,
      this.axesSpecs,
      this.showLegend.get() && !this.legendCollapsed.get(),
      this.legendPosition,
    );

    const geometries = computeSeriesGeometries(
      this.seriesSpecs,
      seriesDomains.xDomain,
      seriesDomains.yDomain,
      seriesDomains.formattedDataSeries,
      seriesColorMap,
      this.chartTheme.colors,
      this.chartDimensions,
    );

    // tslint:disable-next-line:no-console
    // console.log({geometries});
    this.geometries = geometries;

    // // compute visible ticks and their positions
    const axisTicksPositions = getAxisTicksPositions(
      this.chartDimensions,
      this.chartTheme.chart,
      this.chartRotation,
      this.chartTheme.legend,
      this.showLegend.get() && !this.legendCollapsed.get(),
      this.axesSpecs,
      this.axesTicksDimensions,
      seriesDomains.xDomain,
      seriesDomains.yDomain,
      totalGroupCount,
      this.legendPosition,
    );
    // tslint:disable-next-line:no-console
    // console.log({axisTicksPositions});
    this.axesPositions = axisTicksPositions.axisPositions;
    this.axesTicks = axisTicksPositions.axisTicks;
    this.axesVisibleTicks = axisTicksPositions.axisVisibleTicks;
    // if (glyphsCount > MAX_ANIMATABLE_GLYPHS) {
    //   this.canDataBeAnimated = false;
    // } else {
    //   this.canDataBeAnimated = this.animateData;
    // }
    this.canDataBeAnimated = true;

    this.initialized.set(true);
  }
}
