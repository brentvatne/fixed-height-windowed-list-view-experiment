'use strict';

jest.dontMock('../FixedHeightWindowedListViewDataSource');
jest.dontMock('../names');
jest.dontMock('lodash');

let FixedHeightWindowedListViewDataSource = require('FixedHeightWindowedListViewDataSource');
let _ = require('lodash');
let names = require('../names');
let groupedNames = _.groupBy(names, (name) => name[0].toUpperCase());

const sectionHeaderHeight = 35;
const cellHeight = 95;
let dataSource = new FixedHeightWindowedListViewDataSource({
  getHeightForSectionHeader: () => sectionHeaderHeight,
  getHeightForCell: () => cellHeight,
});


describe('DataSource', () => {

  it('calculates rowBeforeHeight correctly for a single section', () => {
    let subject = dataSource.cloneWithCellsAndSections(groupedNames);
    expect(subject.getHeightBeforeRow(0)).toBe(0);
    expect(subject.getHeightBeforeRow(1)).toBe(35);
    expect(subject.getHeightBeforeRow(2)).toBe(130);
  });

  it('calculates rowBeforeHeight correctly for a multiple sections', () => {
    let subject = dataSource.cloneWithCellsAndSections(groupedNames);
    let sectionB = dataSource.getFirstRowOfSection('B');
    let sectionC = dataSource.getFirstRowOfSection('C');
    let firstRowSectionB = sectionB.row;
    let firstRowSectionC = sectionC.row;
    let expectedHeightA = sectionHeaderHeight + (cellHeight * groupedNames['A'].length);
    let expectedHeightB = sectionHeaderHeight + (cellHeight * groupedNames['B'].length);

    // Ensure that the calculated height before the given row is equivalent
    // to what we manually calculated
    expect(subject.getHeightBeforeRow(firstRowSectionB)).toBe(expectedHeightA);
    expect(subject.getHeightBeforeRow(firstRowSectionC)).toBe(expectedHeightA + expectedHeightB);

    // Ensure that the calculated startY matches our manual calculation
    expect(subject.getHeightBeforeRow(firstRowSectionB)).toBe(sectionB.startY);
    expect(subject.getHeightBeforeRow(firstRowSectionC)).toBe(sectionC.startY);
  });

  it('calculates the space between two rows correctly', () => {
    let subject = dataSource.cloneWithCellsAndSections(groupedNames);
    let lastRow = 12;
    let sectionB = dataSource.getFirstRowOfSection('B');
    let expectedHeightBeforeLastRow = sectionHeaderHeight + (cellHeight * lastRow - 1);
    let expectedSpaceBetween = sectionB.startY - expectedHeightBeforeLastRow;

    expect(subject.getHeightBeforeRow(lastRow)).toBe(expectedHeightBeforeLastRow);
    expect(subject.getHeightBetweenRows(lastRow, sectionB.row)).toBe(expectedSpaceBetween);
  });

});
