/**
 * @providesModule FixedHeightWindowedListView
 */
'use strict';

import React, {
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';

import FixedHeightWindowedListViewDataSource from 'FixedHeightWindowedListViewDataSource';
import clamp from './clamp';
import deepDiffer from './deepDiffer';
import invariant from './invariant';
import _ from 'lodash';

/**
 * An experimental ListView implementation that only renders a subset of rows of
 * a potentially very large set of data.
 *
 * Row data should be provided as a simple array corresponding to rows. `===`
 * is used to determine if a row has changed and should be re-rendered.
 *
 * Rendering is done incrementally by row to minimize the amount of work done
 * per JS event tick.
 *
 * Rows must have a pre-determined height, thus FixedHeight. The height
 * of the rows can vary depending on the section that they are in.
 */
export default class FixedHeightWindowedListView extends React.Component {

  constructor(props) {
    super(props);
    invariant(
      this.props.numToRenderAhead < this.props.maxNumToRender,
      'FixedHeightWindowedListView: numToRenderAhead must be less than maxNumToRender'
    );

    this.__onScroll = this.__onScroll.bind(this);
    this.__enqueueComputeRowsToRender = this.__enqueueComputeRowsToRender.bind(this);
    this.__computeRowsToRenderSync = this.__computeRowsToRenderSync.bind(this);
    this.scrollOffsetY = 0;
    this.height = 0;
    this.willComputeRowsToRender = false;
    this.timeoutHandle = 0;
    this.nextSectionToScrollTo = null;
    this.scrollDirection = 'down';

    let { dataSource, initialNumToRender } = this.props;

    this.state = {
      firstRow: 0,
      lastRow: Math.min(dataSource.getRowCount(), initialNumToRender) - 1,
      bufferFirstRow: null,
      bufferLastRow: null,
    };
  }

  componentWillReceiveProps(newProps) {
    this.__computeRowsToRenderSync(newProps);
  }

  componentWillUnmount() {
    clearTimeout(this.timeoutHandle);
  }

  render() {
    this.__rowCache = this.__rowCache || {};

    let { bufferFirstRow, bufferLastRow } = this.state;
    let { firstRow, lastRow } = this.state;
    let { spacerTopHeight, spacerBottomHeight, spacerMidHeight } = this.__calculateSpacers();

    let rows = [];
    rows.push(<View key="sp-top" style={{height: spacerTopHeight}} />);

    if (bufferFirstRow < firstRow && bufferFirstRow !== null) {
      this.__renderCells(rows, bufferFirstRow, bufferLastRow);
      rows.push(<View key="sp-mid" style={{height: spacerMidHeight}} />);
    }

    this.__renderCells(rows, firstRow, lastRow);

    if (bufferFirstRow > lastRow && bufferFirstRow !== null) {
      rows.push(<View key="sp-mid" style={{height: spacerMidHeight}} />);
      this.__renderCells(rows, bufferFirstRow, bufferLastRow);
    }

    let totalRows = this.props.dataSource.getRowCount();
    rows.push(<View key="sp-bot" style={{height: spacerBottomHeight}} />);

    return (
      <ScrollView
        scrollEventThrottle={17}
        removeClippedSubviews={this.props.numToRenderAhead === 0 ? false : true}
        automaticallyAdjustContentInsets={false}
        {...this.props}
        ref={(ref) => { this.scrollRef = ref; }}
        onScroll={this.__onScroll}>
        {rows}
      </ScrollView>
    );
  }

  getScrollResponder() {
    return this.scrollRef &&
      this.scrollRef.getScrollResponder &&
      this.scrollRef.getScrollResponder();
  }

  scrollToSectionBuffered(sectionId) {
    if (!this.isScrollingToSection) {
      let { row, startY } = this.props.dataSource.getFirstRowOfSection(sectionId);
      let { initialNumToRender } = this.props;
      let totalRows = this.props.dataSource.getRowCount();
      let lastRow = totalRows - 1;

      if (row === this.state.firstRow) {
        return;
      }

      // We don't want to run computeRowsToRenderSync while scrolling
      this.__clearEnqueuedComputation();
      this.isScrollingToSection = true;

      // Set up the buffer
      this.setState({
        bufferFirstRow: row,
        bufferLastRow: Math.min(lastRow, row + initialNumToRender), // lol no
      }, () => {
        // Now that the buffer is rendered, scroll to it
        // TODO: if we drop frames on rendering the buffer, we will get a white flash :(
        // so we probably want to check for an onLayout event or timeout after ~80ms
        this.scrollRef.scrollWithoutAnimationTo(startY);

        // A delay is necessary on Android, otherwise we get screen flashes
        // when the buffered section is above the main window. Might be a
        // ScrollView bug -- works fine on iOS without it, thus "maybe"
        this.__maybeWait(() => {
          this.isScrollingToSection = false;

          this.setState({
            firstRow: row,
            lastRow: Math.min(lastRow, row + initialNumToRender),
            bufferFirstRow: null,
            bufferLastRow: null,
          });

          if (this.nextSectionToScrollTo !== null) {
            requestAnimationFrame(() => {
              let nextSectionID = this.nextSectionToScrollTo;
              this.nextSectionToScrollTo = null;
              this.scrollToSectionBuffered(nextSectionID);
            });
          }
        });
      });
    } else {
      this.nextSectionToScrollTo = sectionId; // Only keep the most recent value
    }
  }

  scrollWithoutAnimationTo(destY, destX) {
    this.scrollRef &&
      this.scrollRef.scrollWithoutAnimationTo(destY, destX);
  }

  __maybeWait(callback) {
    if (Platform.OS === 'android') {
      setTimeout(() => {
        callback();
      }, 17 * 2);
    } else {
      callback();
    }
  }

  __renderCells(rows, firstRow, lastRow) {
    for (var idx = firstRow; idx <= lastRow; idx++) {
      let data = this.props.dataSource.getRowData(idx);
      let key = idx.toString();

      rows.push(
        <CellRenderer
          key={key}
          rowIndex={idx}
          shouldUpdate={data !== this.__rowCache[key]}
          render={this.__renderRow.bind(this, data, 0, idx, key)}
        />
      );

      this.__rowCache[key] = data;
    }
  }

  __renderRow(data, unused, idx, key) {
    if (_.isObject(data) && data.sectionId) {
      return this.props.renderSectionHeader(data, unused, idx, key);
    } else {
      return this.props.renderCell(data, unused, idx, key);
    }
  }

  __onScroll(e) {
    this.prevScrollOffsetY = this.scrollOffsetY || 0;
    this.scrollOffsetY = e.nativeEvent.contentOffset.y;
    this.scrollDirection = this.__getScrollDirection();
    this.height = e.nativeEvent.layoutMeasurement.height;
    this.__enqueueComputeRowsToRender();
  }

  __getScrollDirection() {
    if (this.scrollOffsetY - this.prevScrollOffsetY >= 0) {
      return 'down';
    } else {
      return 'up';
    }
  }

  __clearEnqueuedComputation() {
    clearTimeout(this.timeoutHandle);
    this.willComputeRowsToRender = false;
  }

  __enqueueComputeRowsToRender() {
    if (!this.willComputeRowsToRender) {
      this.willComputeRowsToRender = true; // batch up computations
      clearTimeout(this.timeoutHandle);

      this.timeoutHandle = setTimeout(() => {
        this.willComputeRowsToRender = false;
        this.__computeRowsToRenderSync(this.props);
      }, this.props.incrementDelay);
    }
  }

  /**
   * The result of this is an up-to-date state of firstRow and lastRow, given
   * the viewport.
   */
  __computeRowsToRenderSync(props) {
    let { dataSource } = this.props;
    let totalRows = dataSource.getRowCount();

    if (totalRows === 0) {
      this.setState({ firstRow: 0, lastRow: -1 });
      return;
    }

    if (this.state.lastRow >= (totalRows - 1)) {
      return;
    }

    if (this.props.numToRenderAhead === 0) {
      return;
    }

    let { firstVisible, lastVisible } = dataSource.computeVisibleRows(
      this.scrollOffsetY,
      this.height,
    );

    let { firstRow, lastRow, targetFirstRow, targetLastRow } = dataSource.computeRowsToRender({
      scrollDirection: this.scrollDirection,
      firstVisible,
      lastVisible,
      firstRendered: this.state.firstRow,
      lastRendered: this.state.lastRow,
      maxNumToRender: props.maxNumToRender,
      pageSize: props.pageSize,
      numToRenderAhead: props.numToRenderAhead,
      totalRows,
    });

    this.setState({firstRow, lastRow});

    // Keep enqueuing updates until we reach the targetLastRow or
    // targetFirstRow
    if (lastRow !== targetLastRow || firstRow !== targetFirstRow) {
      this.__enqueueComputeRowsToRender();
    }
  }

  /**
   * TODO: pull this out into data source, add tests
   */
  __calculateSpacers() {
    let { bufferFirstRow, bufferLastRow } = this.state;
    let { firstRow, lastRow } = this.state;

    let spacerTopHeight = this.props.dataSource.getHeightBeforeRow(firstRow);
    let spacerBottomHeight = this.props.dataSource.getHeightAfterRow(lastRow);
    let spacerMidHeight;

    if (bufferFirstRow !== null && bufferFirstRow < firstRow) {
      spacerMidHeight = this.props.dataSource.
        getHeightBetweenRows(bufferLastRow, firstRow);

      let bufferHeight = this.props.dataSource.
        getHeightBetweenRows(bufferFirstRow - 1, bufferLastRow + 1);

      spacerTopHeight -= (spacerMidHeight + bufferHeight);
    } else if (bufferFirstRow !== null && bufferFirstRow > lastRow) {
      spacerMidHeight = this.props.dataSource.
        getHeightBetweenRows(lastRow, bufferFirstRow);

      spacerBottomHeight -= spacerMidHeight;
    }

    return {
      spacerTopHeight,
      spacerBottomHeight,
      spacerMidHeight,
    }
  }
}

FixedHeightWindowedListView.DataSource = FixedHeightWindowedListViewDataSource;

FixedHeightWindowedListView.propTypes = {
  dataSource: React.PropTypes.object.isRequired,
  renderCell: React.PropTypes.func.isRequired,
  renderSectionHeader: React.PropTypes.func,
  incrementDelay: React.PropTypes.number,
  initialNumToRender: React.PropTypes.number,
  maxNumToRender: React.PropTypes.number,
  numToRenderAhead: React.PropTypes.number,
  numToRenderBehind: React.PropTypes.number,
  pageSize: React.PropTypes.number,
};

FixedHeightWindowedListView.defaultProps = {
  incrementDelay: 17,
  initialNumToRender: 1,
  maxNumToRender: 20,
  numToRenderAhead: 4,
  numToRenderBehind: 2,
  pageSize: 5,
};

const DEBUG = false;

class CellRenderer extends React.Component {
  shouldComponentUpdate(newProps) {
    return newProps.shouldUpdate;
  }
  render() {
    return (
      <View style={DEBUG && this.props.buffered ? {opacity: 0.8} : {}}>
        {this.props.render()}
      </View>
    );
  }
}

CellRenderer.propTypes = {
  shouldUpdate: React.PropTypes.bool,
  render: React.PropTypes.func,
};
