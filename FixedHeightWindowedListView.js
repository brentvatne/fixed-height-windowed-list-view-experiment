/**
 * @providesModule FixedHeightWindowedListView
 */
'use strict';

import React, {
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
  _rowCache: {[key: string]: mixed};
  onScroll: Function;
  _viewableRows: Array<number>;
  enqueueComputeRowsToRender: Function;
  computeRowsToRenderSync: Function;
  scrollOffsetY: number;
  height: number;
  calledOnEndReached: bool;
  willComputeRowsToRender: bool;
  timeoutHandle: number;
  incrementPending: bool;
  constructor(props: Object) {
    super(props);
    invariant(
      this.props.numToRenderAhead < this.props.maxNumToRender,
      'FixedHeightWindowedListView: numToRenderAhead must be less than maxNumToRender'
    );
    this.onScroll = this.onScroll.bind(this);
    this.enqueueComputeRowsToRender = this.enqueueComputeRowsToRender.bind(this);
    this.computeRowsToRenderSync = this.computeRowsToRenderSync.bind(this);
    this.scrollOffsetY = 0;
    this.height = 0;
    this.calledOnEndReached = false;
    this.willComputeRowsToRender = false;
    this.timeoutHandle = 0;
    this.incrementPending = false;
    this.state = {
      firstRow: 0,
      lastRow:
        Math.min(this.props.dataSource.getRowCount(), this.props.initialNumToRender) - 1,
      firstVisible: -1,
      lastVisible: -1,
    };
  }

  getScrollResponder() {
    return this.scrollRef &&
      this.scrollRef.getScrollResponder &&
      this.scrollRef.getScrollResponder();
  }

  scrollToSectionBuffered(sectionID) {
    let {
      row,
      startY,
    } = this.props.dataSource.getFirstRowOfSection(sectionID);

    if (row === this.state.firstRow) {
      return;
    }

    this.clearEnqueuedComputation();
    this.setState({
      bufferFirstRow: row,
      bufferLastRow: row + 8, // lol no
    }, () => {
      requestAnimationFrame(() => {

        // todo: change this to timeout so we can clear if it's canceled?
        requestAnimationFrame(() => {
          this.scrollRef.scrollWithoutAnimationTo(startY);

          requestAnimationFrame(() => {
            this.setState({
              firstRow: row,
              lastRow: row + 8,
              bufferFirstRow: null,
              bufferLastRow: null,
            });
          });
        });
      });
    });
  }

  clearEnqueuedComputation() {
    clearTimeout(this.timeoutHandle);
    this.willComputeRowsToRender = false;
    this.incrementPending = false;
  }

  scrollWithoutAnimationTo(destY?: number, destX?: number) {
    this.scrollRef &&
      this.scrollRef.scrollWithoutAnimationTo(destY, destX);
  }

  onScroll(e: Object) {
    this.scrollOffsetY = e.nativeEvent.contentOffset.y;
    this.height = e.nativeEvent.layoutMeasurement.height;
    this.enqueueComputeRowsToRender();

    // if (this.props.onViewableRowsChanged) {
    //   let viewableRows = FixedHeightViewabilityHelper.computeViewableRows(
    //     this.props.rowHeight,
    //     e.nativeEvent.contentOffset.y,
    //     e.nativeEvent.layoutMeasurement.height
    //   );
    //   if (deepDiffer(viewableRows, this._viewableRows)) {
    //     this._viewableRows = viewableRows;
    //     this.props.onViewableRowsChanged(viewableRows);
    //   }
    // }
  }

  componentWillReceiveProps(newProps: Object) {
    this.computeRowsToRenderSync(newProps);
  }

  // Allows us to throttle computing new rows to render
  enqueueComputeRowsToRender() {
    if (!this.willComputeRowsToRender) {
      this.willComputeRowsToRender = true; // batch up computations
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = setTimeout(() => {
        this.willComputeRowsToRender = false;
        this.incrementPending = false;
        this.computeRowsToRenderSync(this.props);
      }, this.props.incrementDelay);
    }
  }

  componentWillUnmount() {
    clearTimeout(this.timeoutHandle);
  }

  // Actually computes rows to render.
  // The result of this is an up-to-date state of firstRow, lastRow, firstVisible,
  // lastVisible, given the viewport.
  computeRowsToRenderSync(props: Object): void {
    let totalRows = props.dataSource.getRowCount();

    // TODO: replace this with a dedicated prop for indicating when not to
    // render ahead?
    if (this.props.numToRenderAhead === 0) {
      return;
    }

    // There is no data -- just render nothing and exit early
    if (totalRows === 0) {
      this.setState({
        firstRow: 0,
        lastRow: -1,
        firstVisible: -1,
        lastVisible: -1,
      });
      return;
    }

    // Get the current scrollY top / bottom, then use that to find the
    // first and last visible rows.
    let top = this.scrollOffsetY;
    let bottom = top + this.height;

    let { dataSource } = this.props;
    let { firstVisible, lastVisible } = dataSource.computeVisibleRows(
      this.scrollOffsetY,
      this.height,
    );

    // Sets the currently first and last visible rows in the state
    // and calls props.onVisibleRowsChanged
    this._updateVisibleRows(firstVisible, lastVisible);

    // Calculate how many rows have actually been rendered
    let numRendered = this.state.lastRow - this.state.firstRow + 1;

    // Our last row target that we will approach incrementally
    let targetLastRow = clamp(
      // Don't reduce numRendered when scrolling back up high enough that
      // the target is less than the number of rows currently rendered
      numRendered - 1,
      // Primary goal -- this is what we need lastVisible for
      lastVisible + props.numToRenderAhead,
      // Don't render past the end
      totalRows - 1,
    );

    let lastRow = this.state.lastRow;

    // Increment the last row by props.pageSize each JS event loop
    if (!this.incrementPending) {
      if (targetLastRow > this.state.lastRow) {
        if (targetLastRow - lastRow > this.props.numToRenderAhead) {
          lastRow = targetLastRow;
        } else {
          lastRow = clamp(lastRow, targetLastRow, lastRow + this.props.pageSize);
        }
        this.incrementPending = true;
      } else if (targetLastRow < this.state.lastRow) {
        if (this.state.lastRow - targetLastRow > this.props.pageSize) {
          lastRow = targetLastRow;
        } else {
          lastRow = clamp(lastVisible, lastRow - this.props.pageSize, lastRow);
        }
        this.incrementPending = true;
      }
    }

    // Once last row is set, figure out the first row
    var firstRow = Math.max(
      0, // Don't render past the top
      lastRow - props.maxNumToRender + 1, // Don't exceed max to render
      // lastRow - numRendered + this.props.PageSize, // Don't render more than 1 additional row
    );

    if (lastRow >= totalRows) {
      // It's possible that the number of rows decreased by more than one
      // increment could compensate for.  Need to make sure we don't render more
      // than one new row at a time, but don't want to render past the end of
      // the data.
      lastRow = totalRows - 1;
    }
    if (props.onEndReached) {
      // Make sure we call onEndReached exactly once every time we reach the
      // end.  Resets if scoll back up and down again.
      var willBeAtTheEnd = lastRow === (totalRows - 1);
      if (willBeAtTheEnd && !this.calledOnEndReached) {
        props.onEndReached();
        this.calledOnEndReached = true;
      } else {
        // If lastRow is changing, reset so we can call onEndReached again
        this.calledOnEndReached = this.state.lastRow === lastRow;
      }
    }

    if (this.state.firstRow !== firstRow || this.state.lastRow !== lastRow) {
      this.setState({firstRow, lastRow});
    }

    // Keep enqueuing updates until we reach the targetLastRow
    if (lastRow !== targetLastRow) {
      this.enqueueComputeRowsToRender(); // Make sure another increment is queued
    }
  }

  // Fire onVisibleRowsChanged and update component state of
  // firstVisible / lastVisible
  _updateVisibleRows(newFirstVisible, newLastVisible) {
    if (this.state.firstVisible !== newFirstVisible ||
        this.state.lastVisible !== newLastVisible) {
      if (this.props.onVisibleRowsChanged) {
        this.props.onVisibleRowsChanged(
          newFirstVisible,
          newLastVisible - newFirstVisible + 1);
      }
      this.setState({
        firstVisible: newFirstVisible,
        lastVisible: newLastVisible,
      });
    }
  }

  renderRow(data, unused, idx, key) {
    if (_.isObject(data) && data.sectionID) {
      return this.props.renderSectionHeader(data, unused, idx, key);
    } else {
      return this.props.renderCell(data, unused, idx, key);
    }
  }

  render() {
    // rowCache maps row data to row keys, which is particularly useful for
    // the enableRecyclingProp
    this._rowCache = this._rowCache || {};

    let { bufferFirstRow, bufferLastRow } = this.state;
    let { firstRow, lastRow } = this.state;
    let rows = [];

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

    // Render the top spacer
    rows.push(<View key="sp-top" style={{height: spacerTopHeight}} />);
    // console.log('sp-top: ' + spacerTopHeight);

    // ***************************************************
    if (bufferFirstRow !== null && bufferFirstRow < firstRow) {
      for (var idx = bufferFirstRow; idx <= bufferLastRow; idx++) {
        let data = this.props.dataSource.getRowData(idx);
        let key = '' + idx;

        rows.push(
          <CellRenderer
            key={key}
            buffered={true}
            rowIndex={idx}
            shouldUpdate={data !== this._rowCache[key]}
            render={this.renderRow.bind(this, data, 0, idx, key)}
          />
        );

        this._rowCache[key] = data;
      }

      // console.log('sp-mid-top: ' + spacerMidHeight);
      rows.push(<View key="sp-mid" style={{height: spacerMidHeight}} />);
    }
    // ***************************************************

    // Build up our actual content rows
    for (var idx = firstRow; idx <= lastRow; idx++) {
      let data = this.props.dataSource.getRowData(idx);
      let key = '' + idx;

      rows.push(
        <CellRenderer
          key={key}
          rowIndex={idx}
          shouldUpdate={data !== this._rowCache[key]}
          render={this.renderRow.bind(this, data, 0, idx, key)}
        />
      );

      this._rowCache[key] = data;
    }

    // ***************************************************
    if (bufferFirstRow !== null && bufferFirstRow > lastRow) {
      // console.log('sp-mid-bot: ' + spacerMidHeight);
      rows.push(<View key="sp-mid" style={{height: spacerMidHeight}} />);

      for (var idx = bufferFirstRow; idx <= bufferLastRow; idx++) {
        let data = this.props.dataSource.getRowData(idx);
        let key = '' + idx;

        rows.push(
          <CellRenderer
            key={key}
            buffered={true}
            rowIndex={idx}
            shouldUpdate={data !== this._rowCache[key]}
            render={this.renderRow.bind(this, data, 0, idx, key)}
          />
        );

        this._rowCache[key] = data;
      }
    }
    // ***************************************************

    // Render the bottom spacer
    // console.log('sp-bot: ' + spacerBottomHeight)
    rows.push(
      <View
        key="sp-bot"
        style={{height: spacerBottomHeight}}>
      </View>
    );

    return (
      <ScrollView
        scrollEventThrottle={17}
        removeClippedSubviews={this.props.numToRenderAhead === 0 ? false : true}
        automaticallyAdjustContentInsets={false}
        {...this.props}
        ref={(ref) => { this.scrollRef = ref; }}
        onScroll={this.onScroll}>
        {rows}
      </ScrollView>
    );
  }
}

FixedHeightWindowedListView.DataSource = FixedHeightWindowedListViewDataSource;

FixedHeightWindowedListView.propTypes = {
  dataSource: React.PropTypes.object.isRequired,
  renderCell: React.PropTypes.func.isRequired,
  renderSectionHeader: React.PropTypes.func,
  onVisibleRowsChanged: React.PropTypes.func,
  onViewableRowsChanged: React.PropTypes.func,
  enableRecycling: React.PropTypes.bool,
  incrementDelay: React.PropTypes.number,
  initialNumToRender: React.PropTypes.number,
  maxNumToRender: React.PropTypes.number,
  numToRenderAhead: React.PropTypes.number,
  pageSize: React.PropTypes.number,
};

FixedHeightWindowedListView.defaultProps = {
  enableRecycling: false,
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
