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
 * Rows must have a pre-determined height, thus FixedHeight.
 *
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
    this.incrementPending = false;
    this.nextSectionToScrollTo = null;

    let { dataSource, initialNumToRender } = this.props;

    this.state = {
      firstRow: 0,
      lastRow: Math.min(dataSource.getRowCount(), initialNumToRender) - 1,
      bufferFirstRow: null,
      bufferLastRow: null,
    };
  }

  getScrollResponder() {
    return this.scrollRef &&
      this.scrollRef.getScrollResponder &&
      this.scrollRef.getScrollResponder();
  }

  scrollToSectionBuffered(sectionId) {
    if (!this.isScrollingToSection) {
      let { row, startY } = this.props.dataSource.getFirstRowOfSection(sectionId);

      if (row === this.state.firstRow) {
        return;
      }

      // We don't want to run computeRowsToRenderSync while scrolling
      this.__clearEnqueuedComputation();
      this.isScrollingToSection = true;

      // Set up the buffer
      this.setState({
        bufferFirstRow: row,
        bufferLastRow: row + 8, // lol no
      }, () => {
        // Now that the buffer is rendered, scroll to it
        // TODO: if we drop frames on rendering the buffer, we will get a white flash :(
        // so we probably want to check for an onLayout event or timeout after ~80ms
        this.scrollRef.scrollWithoutAnimationTo(startY);

        // A delay is necessary on Android, otherwise we get screen flashes
        // when the buffered section is above the main window. Might be a
        // ScrollView bug -- works fine on iOS without it, thus "maybe"
        this.maybeWait(() => {
          this.isScrollingToSection = false;

          this.setState({
            firstRow: row,
            lastRow: row + 8,
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
      // Only keep the most recent value
      this.nextSectionToScrollTo = sectionId;
    }
  }

  maybeWait(callback) {
    if (Platform.OS === 'android') {
      setTimeout(() => {
        callback();
      }, 17 * 2);
    } else {
      callback();
    }
  }

  scrollWithoutAnimationTo(destY?: number, destX?: number) {
    this.scrollRef &&
      this.scrollRef.scrollWithoutAnimationTo(destY, destX);
  }

  componentWillReceiveProps(newProps) {
    this.__computeRowsToRenderSync(newProps);
  }

  componentWillUnmount() {
    clearTimeout(this.timeoutHandle);
  }

  renderRow(data, unused, idx, key) {
    if (_.isObject(data) && data.sectionId) {
      console.log(data);
      return this.props.renderSectionHeader(data, unused, idx, key);
    } else {
      return this.props.renderCell(data, unused, idx, key);
    }
  }

  render() {
    this.__rowCache = this.__rowCache || {};

    let { bufferFirstRow, bufferLastRow } = this.state;
    let { firstRow, lastRow } = this.state;
    let { spacerTopHeight, spacerBottomHeight, spacerMidHeight } = this.__calculateSpacers();

    let rows = [];
    console.log('sp-top: ' + spacerTopHeight);
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
    // console.log('totalRows: ' + totalRows);
    // console.log('lastRow: ' + lastRow);
    // console.log('sp-bot: ' + spacerBottomHeight);
    rows.push(<View key="sp-bot" style={{height: spacerBottomHeight}} />);

    return (
      <ScrollView
        scrollEventThrottle={17}
        decelerationRate={0.99}
        removeClippedSubviews={this.props.numToRenderAhead === 0 ? false : true}
        automaticallyAdjustContentInsets={false}
        {...this.props}
        ref={(ref) => { this.scrollRef = ref; }}
        onScroll={this.__onScroll}>
        {rows}
      </ScrollView>
    );
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
          render={this.renderRow.bind(this, data, 0, idx, key)}
        />
      );

      this.__rowCache[key] = data;
    }
  }

  __onScroll(e) {
    this.scrollOffsetY = e.nativeEvent.contentOffset.y;
    this.height = e.nativeEvent.layoutMeasurement.height;
    this.__enqueueComputeRowsToRender();
  }

  __clearEnqueuedComputation() {
    clearTimeout(this.timeoutHandle);
    this.willComputeRowsToRender = false;
    this.incrementPending = false;
  }

  __enqueueComputeRowsToRender() {
    if (!this.willComputeRowsToRender) {
      this.willComputeRowsToRender = true; // batch up computations
      clearTimeout(this.timeoutHandle);

      this.timeoutHandle = setTimeout(() => {
        this.willComputeRowsToRender = false;
        this.incrementPending = false;
        this.__computeRowsToRenderSync(this.props);
      }, this.props.incrementDelay);
    }
  }

  /**
   * The result of this is an up-to-date state of firstRow and lastRow, given
   * the viewport.
   */
  __computeRowsToRenderSync(props) {
    // let startTime = new Date();
    let totalRows = props.dataSource.getRowCount();

    if (totalRows === 0) {
      this.setState({ firstRow: 0, lastRow: -1 });
      return;
    }

    if (this.props.numToRenderAhead === 0) {
      return;
    }

    let top = this.scrollOffsetY;
    let bottom = top + this.height;

    let { dataSource } = this.props;
    let { firstRow, lastRow } = this.state;
    let { firstVisible, lastVisible } = dataSource.computeVisibleRows(
      this.scrollOffsetY,
      this.height,
    );

    // Calculate how many rows have actually been rendered
    let numRendered = lastRow - firstRow + 1;

   // Our last row target that we will approach incrementally
    let targetLastRow = clamp(
      numRendered - 1, // Don't reduce numRendered when scrolling back up high enough that the target is less than the number of rows currently rendered
      // Primary goal -- this is what we need lastVisible for
      lastVisible + props.numToRenderAhead,
      // Don't render past the end
      totalRows - 1,
    );

    if (this.state.lastRow === targetLastRow && targetLastRow === totalRows - 1) {
      return;
    }


    if (!this.incrementPending) {
      this.incrementPending = true;

      if (targetLastRow > lastRow) {
        if (targetLastRow - lastRow > this.props.numToRenderAhead) {
          lastRow = targetLastRow;
        } else {
          lastRow = clamp(lastRow, targetLastRow, lastRow + this.props.pageSize);
        }
        // lastRow = clamp(this.state.lastRow, targetLastRow, totalRows - 1);
      } else if (targetLastRow < lastRow) {
        lastRow = clamp(lastVisible, lastRow - this.props.pageSize, lastRow);
      }
    }

    // Once last row is set, figure out the first row
    firstRow = Math.max(
      0, // Don't render past the top
      lastRow - props.maxNumToRender + 1, // Don't exceed max to render
    );

    this.setState({firstRow, lastRow});

    // Keep enqueuing updates until we reach the targetLastRow
    if (lastRow !== targetLastRow) {
      this.__enqueueComputeRowsToRender(); // Make sure another increment is queued
    }

    // let endTime = new Date();
    // console.log('computeRowsToRenderSync: ' + (endTime - startTime));
  }

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
  pageSize: React.PropTypes.number,
};

FixedHeightWindowedListView.defaultProps = {
  incrementDelay: 17,
  initialNumToRender: 1,
  maxNumToRender: 20,
  numToRenderAhead: 4,
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
