# elastic-charts

This library is a complete rewrite of the current vislib in Kibana and EUISeriesChart in EUI.
The rationale behind this refactoring is the need of a testable and decoupled architecture for displaying data as charts. The current EUI implementation is based on ReactVis that directly manipulate data series inside components, without a clear rendering pipeline and without a clean way to extend it. Some of the down side of using react vis are:
- the main chart component, before rendering children, looks at their props and recompute them injecting new props. Some configuration are accessed through references to children components 
- the components are themself svg components that render bars, lines, axis. The problem with this is that not all components can be rendered at the same time, but there is the need of a rendering pipeline to allow a correct placement for all the geometries, specially when we face the need of having auto-scaled axis dimensions.
- the only way to test the chart is testing the resulting svg component. If rendered through canvas the test can be only a visual regression test.
- no possibility of manage x-indexing of elements

This new implementation revisit the concept of charting library and tries to apply an unidirectional rendering flow to the concept of charting. The rendering flow is the following:

![rendering-pipeline](https://user-images.githubusercontent.com/1421091/49724064-bba8cb80-fc68-11e8-8378-9d59b941f15d.png)

This controlled flows allows us to achieve the following points:
- the computation of series dimensions (x and y domains of the datasets for examples) are required to precompute the space required for the axis labelling. Axis rendering is dependant on the axis displayed values thus on the dataseries provided. To accommodate automatically spaced axis this is a required passage. Other libraries just live the developer with the needs to specify static margin space for render the axis labels that can incur into truncated labels.
- put a testing probes just before rendering the chart, the computed geometries are the exact values that needs to be used to render on svg, canvas or webgl on that exact portion of the screen. No further calculation are needed on the rendered. x, y, width, height, color, transforms are computed before the rendering phase that action.
- reduce the rendering operation to the minimum required. Resizing for example will only require the last 3 phases to complete.
- decouple the charts from its rendering medium: can be svg, canvas or webgl, using react or any other DOM library.
- part of this computation can also be processed server side or on a webworker.

The rendering pipeline is achieved revisiting the way on how a chart library is built. Instead of create a chart library around a set of rendering components: bar series, axis etc, this new implementation decouple the specification of the chart from the rendering components. The rendering components are part of the internals of the library. We are exposing `empty` react components to the developer, using the JSX format just as a declarative language to describe the specification of your chart and not as a set of real react component that will render something.
That is achieved using the following render function on the main `Chart` component:
```jsx
<Provider chartStore={this.chartSpecStore}>
  <Fragment>
    <SpecsParser>
      { this.props.children }
    </SpecsParser>
    <ChartResizer />
    {
      renderer === 'svg' && <SVGChart />
    }
    {
      renderer === 'canvas' && <CanvasChart />
    }
    {
      renderer === 'canvas_native' && <NativeChart />
    }
    <Tooltips />
  </Fragment>
</Provider>
```
Where all the children passed are rendered inside the `SpecsParser`, that signal a state manager that we are updating the specification of the chart, but doesn't render anything.
The actual rendering is done by one of the rendered like the `ReactChart` that is rendered after the rendering pipeline produced and saved the geometries on the state manager.

A spec can be something like the following:

```jsx
<Chart renderer={renderer}>
  <Settings
    rotation={rotation}
    animateData={true}
  />
  <Axis
    id={getAxisId('bottom')}
    position={AxisPosition.Bottom}
    title={`Rendering test`}
  />
  <Axis
    id={getAxisId('left')}
    position={AxisPosition.Left}
  />
  <LineSeries
    id={getSpecId('1')}
    yScaleType={ScaleType.Linear}
    xScaleType={ScaleType.Linear}
    xAccessor="x"
    yAccessors={['y']}
    data={BARCHART_1Y0G}
  />
  <BarSeries
    id={getSpecId('2')}
    yScaleType={ScaleType.Linear}
    xScaleType={ScaleType.Linear}
    xAccessor="x"
    yAccessors={['y1', 'y2']}
    splitSeriesAccessors={['g']}
    stackAccessors={['x', 'g']}
    data={BARCHART_2Y1G}
  />
</Chart>
```

## Concepts

### Axes
The concept of axes in this library follow the following constraints: 
- there is no distinction between x axis or y axis.
- the distinction is between the position of the axis on the chart, top, bottom, left, right in relation with the rotation of the chart: A standard horizontal bar chart, with the Y,  dependant variable, that raise to the top, can be supported by left and right axis that will shows the Y values, and bottom and top axis that will shows the X, independant variable. On the contrary, a 90 degree clockwise rotated bar chart, with the Y value that spread from left to right, will have a horizontal (bottom/top) axis that shows the Y independant variable and the left/right vertical axis that shows the X variable.

As a constraint we allow only one X axis, but we provide the ability to add multiple Y axis (also if it's a discouraged practice (see https://blog.datawrapper.de/dualaxis/ or http://www.storytellingwithdata.com/blog/2016/2/1/be-gone-dual-y-axis)

### Dataset Domains:
Related to a dataset, is the extent of a variable. It usually used to draw the position of the specific value/datum along one axis (vertical or horizontal).
On a series chart, we always needs to have at least two domain, representing the 2 dimensions of the data we are drawing.

### Data
It's an array of values, that will be used to compute the chart. Usually each element must have at least 2 values to be charted. Multiple values can be used to specify how we want to split the chart by series and by y values.

Examples of datasets:
```ts
// 1 metric (y) and no groups/split series ===> 1 single series
const BARCHART_1Y0G = [
  { x: 0, y: 1 },
  { x: 1, y: 2 },
  { x: 2, y: 10 },
  { x: 3, y: 6 },
];

// 2 metrics (2y) and 1 group/split series ===> 4 different data series
const BARCHART_2Y1G = [
  { x: 0, g: 'a', y1: 1, y2: 4 },
  { x: 0, g: 'b', y1: 3, y2: 6 },
  { x: 1, g: 'a', y1: 2, y2: 1 },
  { x: 1, g: 'b', y1: 2, y2: 5 },
  { x: 2, g: 'a', y1: 10, y2: 5 },
  { x: 2, g: 'b', y1: 3, y2: 1 },
  { x: 3, g: 'a', y1: 7, y2: 3 },
  { x: 3, g: 'b', y1: 6, y2: 4 },
];
```

These datasets can be used as input for any type of chart specification. These are the interfaces that makes up a `BasicSpec` (some sort of abstract specification)

```ts
export interface SeriesSpec {
  /* The ID of the spec, generated via getSpecId method */
  id: SpecId;
  /* The ID of the spec, generated via getGroupId method, default to __global__ */
  groupId: GroupId;
  /* An array of data */
  data: Datum[];
  /* If specified, it constrant the x domain to these values */
  xDomain?: Domain;
  /* If specified, it constrant the y Domain to these values */
  yDomain?: Domain;
  /* The type of series you are looking to render */
  seriesType: 'bar' | 'line' | 'area' | 'basic';
}

export interface SeriesAccessors {
  /* The field name of the x value on Datum object */
  xAccessor: Accessor;
  /* An array of field names one per y metric value */
  yAccessors: Accessor[];
  /* An array of fields thats indicates the datum series membership */
  splitSeriesAccessors?: Accessor[];
  /* An array of fields thats indicates the stack membership */
  stackAccessors?: Accessor[];
  /* An optional array of field name thats indicates the stack membership */
  colorAccessors?: Accessor[];
}

export interface SeriesScales {
  /* The x axis scale type */
  xScaleType: ScaleType;
  /* The y axis scale type */
  yScaleType: ScaleContinuousType;
  /** if true, the min y value is set to the minimum domain value, 0 otherwise */
  yScaleToDataExtent: boolean;
}
```

A `BarSeriesSpec` for example is the following union type:
```ts
export type BarSeriesSpec = SeriesSpec & SeriesAccessors & SeriesScales & {
  seriesType: 'bar';
};
```

A chart can be feed with data in the following ways:

- one series type specification with one `data` props configured.
- a set of series types with `data` props configured. In these case the data arrays are merged together as the following rules:
  - x values are merged together. If chart have multiple different `xScaleType`s, the main x scale type is coerced to `ScaleType.Linear` if all the scales are continuous or to `ScaleType.Ordinal` if one scale type is ordinal. Also temporal scale is, in specific case coerched to linear, so be carefull to configure correctly the scales.
  - if there is a specified x domain on the spec, this is used as x domain for that series, and it's merged together with the existing x domains.
  - specifications with `splitAccessors` are splitted into diffenent series. Each specification is treathed in a separated manner: if you have one chart with 3 series merged to one chart with 1 series, this results in the a chart like that has each x value splitted in two (the number of specification used, two charts) than on split is used to accomodate 3 series and the other to accomodate the remaining series. If you want to threat each series on the same way, split your chart before and create 4 different BarSeries specs, so that these are rendered evenly on the x axis.
  - bar, area, line series with a `stackAccessor` are stacked together each stacked above their respective group (areas with areas, bars with bars, lines with lines. You cannot mix stacking bars above lines above areas). 
  - bar series without `stackAccessors` are clustered together for the same x value
  - area and line series, without `stackAccessors` are just drawn each one on their own layer (not stacked nor clustered).
  - the y value is influenced by the following aspects:
    - if there is a specified y domain on the spec, this is used as y domain for that series
    - if no or only one y axis is specified, each y value is threathed as part of the same domain.
    - if there is more than one y axis (visible or not), the y domains are merged in respect of the same `groupId`. For e.g. two bar charts, and two y axis, each for a spec, one per bar value. The rendered bar height are independent each other, because  of the two axis.
    - if the data are stacked or not. Stacked produce a rendering where the lower bottom of the chart is the previous series y value.

On the current `Visualize Editor`, you can stack or cluster in the following cases:
- when adding multiple Y values: each Y value can be stacked (every type) or clustered (only bars)
- when splitting a series, each series can be stacked (every type) or clustered (only bars)

### Multiple charts/Split charts/Small Multiples (phase 2)

Small multiples are created using the `<SmallMultiples>` component, that takes multiple `<SplittedSeries>` component with the usual element inside. `<SplittedSeries>` can contains only `BarSeries` `AreaSeries` and `LineSeries` Axis and other configuration needs to be configured outside the `SplittedSeries` element.

In case of small multiples, each `SplittedSeries` compute its own x and y domains. Than the x domains are merged and expanded. The same happens with the main Y domains, they are merged together.


### Colors

Each data series can have its own color. 
The color is assigned through the `colorAccessors` prop that specify which data attributes are used to define the color,
for example:
- a dataset without any split accessor or fields that can be used to identify a color will have a single color.
- a dataset that has 1 variable to split the dataset into 3 different series, will have 3 different colors if that variable is specified throught the `colorAccessors`.
- a dataset with 2 split variables, each with 3 different values (a dataset with 3 * 2 series) will have 6 different colors if the two variables are defined in `colorAccessors`
- a dataset with 2 split variables, each with 3 different values, but only one specified in the `colorAccessors` will have only 3 colors.
- if no `colorAccessors` is specified, it will be used `splitAccessors` to identifiy how to coloring the series

## To do list

### Paddings/Margins
- [x] Add chart padding
- [x] Add data padding between chart and axis (a configurable padding of the chart elements and the axis

### Scales
- [x] Add time scale (see limitations)
- [x] Merge scales with multiple series depending on grouping (phase 1: basic merging, no stacking controls/rendering order)
- [x] Add custom X domain for series (enable the dev to add it’s own domain extents to control the visualization)
- [x] Fix computeOrdinalDataDomain in domain.ts sort by uniq value: add comparator
- [x] Check when adding one or more split series, transform the x axis from linear/time to ordinal
- [x] Compute the right band width for a linear/time scale type
- [x] Check if 0 split series are used, than use the original x scale type (linear, time etc)
- [x] Transform ordinal scales into linear scales to compute less number of ticks when possible (our current ordinal scale compute all ticks dimensions for each element in the domain, if the dataset x value can be converted into a linear scale, it’s better to convert back to linear before computing ticks to optimise axis computation)
- [x] Fix ordinal scales rendering with multiple data series



### Colors
- [x] Add basic colors to bar charts (define what is the policy behind colouring)
- [x] Merge colour scales: when using more than one series type (bar + line) manage the colors together
- [ ] Add external custom colour from spec props



### Axis
- [ ] Rotate labels
- [x] Set max axis extent
- [ ] Horizontal / vertical grids
- [ ] Configure axis label max width/height as multiple of EUI sizes
##### phase 2:
- [ ] Add multilevel axis (shows axis on sub/aggregations)

### Charts
- [x] Add opaque non stacked bar/area charts
- [x] Add curves to lines and areas
- [x] Add bar series chart
- [x] Add area chart
- [x] Add line chart
- [x] Add stacked area charts
- [x] Add stacked line charts
- [x] Renderer multiple type charts
- [ ] Handle negative values in stacked area charts
- [ ] Add test with 3 or more stacked areas
- [ ] Add z-index to each series
##### phase 2:
- [ ] Add histogram (histogram can be created using 0 padding on bar charts)

### Interaction/Animation
- [x] Add interactions (tooltip)
- [x] Add animations
- [x] Add background rect to each interval to enable the highlight
- [x] Add hover interaction to line charts
- [x] Add hover interaction to area charts 
- [ ] Add color to tooltip value
- [ ] Add brush/selection tool (check if the selection be discrete and relative to the main X axis value. Keep the brush tool independent from the elements on the chart aka drag from everywere)
#### phase 2
- [ ] Merge interaction on multiple type/series charts: crosshair

### General
- [x] Implement chart rendering in canvas (konva)
- [x] Implement first version of chart in Canvas
- [x] Chart rotation 90 degree
- [x] Chart rotation -90 degree
- [x] Chart rotation 180 degree
- [x] Expose the chart rotation props to a generic Settings component
- [x] Add chart theming options
- [x] Refactor axis dimension computation to accommodate the new format of series/domains
- [ ] Remove unnecessary code of the old bar, line, area rendering
- [ ] Add a direct render in konva native, without the use of React to increase performance.
- [ ] Fitting functions elastic/kibana#17717
- [ ] Fix yScaleToDataExtent: some bars are overflowing the chart
- [ ] Check performances (build, animate and update 1 high density chart, multiple small density charts, multiple medium density charts)
##### phase 2:
- [ ] Move theming from canvas to SVG
- [ ] Keep up to speed with SVG rendering
- [ ] Move to redux?

### Legends
- [x] Add legend component
- [ ] Add color picker for each legend series
- [ ] Add hover/click event for each legend series 

##### phase 2:
- [ ] Use a legend item to display hovered items values.


### Limitations
- ~To use a time base series, the data must be dense: every time interval must be present on the dataset. Use an ordinal scale type and add a data formatter for the x axis values.~

### Checklist

- [ ] This was checked in mobile
- [ ] This was checked in IE11
- [ ] This was checked in dark mode
- [ ] Any props added have proper autodocs
- [ ] Documentation examples were added
- [ ] A [changelog](https://github.com/elastic/eui/blob/master/CHANGELOG.md) entry exists and is marked appropriately
- [ ] This was checked for breaking changes and labeled appropriately
- [x] Jest tests were updated or added to match the most common scenarios
- [ ] This was checked against keyboard-only and screenreader scenarios
