/**
 * @providesModule FixedHeightWindowedListViewDataSource
 */
'use strict';

const _ = require('lodash');

/* Helper class to perform calcuations required by FixedHeightWindowedListView.
 *
 * sectionHeader: Different height from cell, groups cells
 * cell: Content that is not a section header
 * row: A section header or a cell
 *
 */
class FixedHeightListViewDataSource {
  constructor(params) {
    this._dataSource = [];
    this._lookup = {};

    this._getHeightForSectionHeader = params.getHeightForSectionHeader;
    this._getHeightForCell = params.getHeightForCell;
  }


  // Public: Used to set the height of the top spacer
  //
  // i - the index of a row in _dataSource
  //
  // Returns the height of spacer before the first rendered row.
  //
  getHeightBeforeRow(i) {
    let height = 0;

    _.forEach(this._lookup, (section, sectionID) => {
      if (i > section.range[0] && i <= section.range[1]) {
        height += section.sectionHeaderHeight;
        height += ((i - 1) - section.range[0]) * section.cellHeight;
      } else if (section.range[0] < i) {
        height += section.height;
      }
    });

    return height;
  }

  getFirstRowOfSection(sectionID) {
    let range = this._lookup[sectionID].range;
    let startY = this._lookup[sectionID].startY;

    return {
      row: range[0],
      startY,
    };
  }

  // Public: .....
  getHeightBetweenRows(i, ii) {
    if (ii < i) {
      console.warn('provide the lower index first');
    }

    return this.getHeightBeforeRow(ii) - this.getHeightBeforeRow(i + 1);
  }

  // Public: Used to set the height of the bottom spacer
  //
  // i - the index of a row in _dataSource
  //
  // Returns the height of spacer after the last rendered row.
  //
  getHeightAfterRow(i) {
    return (
      this.getTotalHeight() -
      this.getHeightBeforeRow(i) -
      this.getRowHeight(i)
    );
  }

  // Public: Used by computeRowsToRenderSync to determine what the target
  // last row is (lastVisible + numToRenderAhead)
  //
  computeVisibleRows(scrollY, viewportHeight) {
    let firstVisible = this.getRowAtHeight(scrollY);
    let lastVisible = this.getRowAtHeight(scrollY + viewportHeight);

    return {
      firstVisible,
      lastVisible,
    };
  }

  // Public: Gets the number of rows (cells + section headers)
  //
  // Returns the number of rows.
  //
  getRowCount() {
    return this._dataSource.length;
  }

  // Public: Gets the data for a cell or header at the given row index
  //
  // Returns whatever is stored in datasource for the given index
  //
  getRowData(i) {
    return this._dataSource[i];
  }

  // Private: Used internally by computeVisibleRows
  //
  // scrollY - the Y position at the top of the ScrollView
  //
  // Returns the index of the row in the _dataSource array that should be
  // rendered at the given scrollY.
  //
  getRowAtHeight(scrollY) {
    if (scrollY < 0 || scrollY > this.getTotalHeight()) {
      return 0;
    }

    let parentSection = _.find(this._lookup, (value) => {
      return scrollY >= value.startY && scrollY <= value.endY;
    });

    let relativeY = scrollY - parentSection.startY;

    if (relativeY <= parentSection.sectionHeaderHeight) {
      return parentSection.range[0];
    } else {
      let i = Math.floor(
        (relativeY - parentSection.sectionHeaderHeight) /
        parentSection.cellHeight
      );
      return parentSection.range[0] + i;
    }
  }

  getRowHeight(i) {
    let row = this._dataSource[i];

    if (_.isObject(row) && row.sectionID) {
      return this.getSectionHeaderHeight(row.sectionID);
    } else {
      return this.getCellHeight(i);
    }
  }

  getSectionHeaderHeight(sectionID) {
    return this._lookup[sectionID].sectionHeaderHeight;
  }

  getCellHeight(i) {
    let parentSection = _.find(this._lookup, (section) => {
      return i >= section.range[0] || i <= section.range[1];
    });

    if (parentSection) {
      return parentSection.cellHeight;
    }
  }

  getTotalHeight() {
    let keys = Object.keys(this._lookup);
    let lastSection = this._lookup[keys[keys.length - 1]];

    if (lastSection) {
      return lastSection.endY;
    } else {
      return 0;
    }
  }

  cloneWithCellsAndSections(dataBlob) {
    // Take in { 'A': [{..}, {..}], 'B': [{..}]} and turn it into
    //         [ { sectionID: 'A' }, {..}, {..}, { sectionID: 'B' }, {..} ]
    //
    // This is important because we want to treat section headers just as
    // other rows.
    this._dataSource = _.reduce(dataBlob, (result, value, key) => {
      result.push({sectionID: key});
      result.push.apply(result, value);
      return result;
    }, []);

    // Build a data structure like this so we can easily perform calculations we
    // need later:
    // { 'A': { rows: 2, range: [0, 2], height: 250, startY: 0, endY: 250, cellHeight: 95, sectionHeaderHeight: 35} }
    let lastRow = -1;
    let cumulativeHeight = 0;
    this._lookup = _.reduce(Object.keys(dataBlob), (result, sectionID) => {
      let sectionHeaderHeight = this._getHeightForSectionHeader(sectionID);
      let cellHeight = this._getHeightForCell(sectionID);
      let count = dataBlob[sectionID].length;
      let sectionHeight = sectionHeaderHeight + cellHeight * count;

      result[sectionID] = {
        count: count + 1, // Factor in section header
        range: [lastRow + 1, lastRow + 1 + count], // Move 1 ahead of previous last row
        height: sectionHeight,
        startY: cumulativeHeight,
        endY: cumulativeHeight + sectionHeight,
        cellHeight,
        sectionHeaderHeight,
      }

      cumulativeHeight += sectionHeight;
      lastRow = lastRow + 1 + count;

      return result;
    }, {});

    return this;
  }

  getHeightOfSection(sectionID) {
    return this._lookup[sectionID].height;
  }

  /**
   * Returns an array containing the number of rows in each section
   */
  getSectionLengths() {
    return _.reduce(this._lookup, (result, value) => {
      result.push(value.count);
      return result;
    }, []);
  }
}

module.exports = FixedHeightListViewDataSource;
