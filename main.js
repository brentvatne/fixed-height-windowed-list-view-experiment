/**
 * This is the entry point for your experience that you will run on Exponent.
 *
 * Start by looking at the render() method of the component called
 * FirstExperience. This is where the text and example components are.
 */
'use strict';

import React, {
  AppRegistry,
  Component,
  Image,
  TouchableHighlight,
  ScrollView,
  StyleSheet,
  Text,
  PanResponder,
  TouchableWithoutFeedback,
  View,
  Platform,
} from 'react-native';

import _ from 'lodash';
import FixedHeightWindowedListView from 'FixedHeightWindowedListView';
import SwipeToDelete from 'SwipeToDelete';

let names = require('./names');
names = _.groupBy(require('./names'), (name) => name[0].toUpperCase());

class Main extends React.Component {
  constructor(props, context) {
    super(props, context);

    let dataSource = new FixedHeightWindowedListView.DataSource({
      getHeightForSectionHeader: (sectionId) => {
        return 35;
      },
      getHeightForCell: (sectionId) => {
        return 95;
      }
    });

    this.state = {
      dataSource: dataSource.cloneWithCellsAndSections(names),
    };
  }

  render() {
    return (
      <View style={{flex: 1}}>
        <View style={styles.container}>
          <FixedHeightWindowedListView
            ref={view => this._listView = view}
            dataSource={this.state.dataSource}
            renderCell={this._renderCell.bind(this)}
            renderSectionHeader={this._renderSectionHeader.bind(this)}
            getHeightForRowInSection={this._getHeightForRowInSection}
            incrementDelay={17}
            initialNumToRender={15}
            maxNumToRender={50}
            pageSize={Platform.OS === 'ios' ? 25 : 10}
            numToRenderAhead={this.state.isTouching ? 0 : 25}
          />
        </View>

        <View style={styles.alphabetSidebar} shouldRasterizeIOS>
          <AlphabetPicker
            onTouchStart={() => { this.setState({isTouching: true}) }}
            onTouchEnd={() => { this.setState({isTouching: false}) }}
            onTouchLetter={this._onTouchLetter.bind(this)} />
        </View>
      </View>
    );
  }

  _onTouchLetter(letter) {
    console.log(letter);
    this._listView.scrollToSectionBuffered(letter);
  }

  _renderSectionHeader(data) {
    return (
      <View style={{height: 35, justifyContent: 'center', backgroundColor: '#eee', paddingLeft: 10}}>
        <Text>{data.sectionID}!!</Text>
      </View>
    );
  }

  _renderCell(data) {
    return (
      <ContactCell data={data} />
    );
  }
}

class LetterPicker extends React.Component {

  render() {
    return (
      <Text style={{fontSize: 11, fontWeight: 'bold'}}>
        {this.props.letter}
      </Text>
    );
  }
}

const Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split('');
class AlphabetPicker extends React.Component {

  componentWillMount() {
    this._panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e, gestureState) => {
        this.props.onTouchStart && this.props.onTouchStart();

        let letter = this._findTouchedLetter(gestureState.y0);
        if (letter) {
          this.props.onTouchLetter && this.props.onTouchLetter(letter);
        }
      },
      onPanResponderMove: (evt, gestureState) => {
        // TODO: This should adjust itself automatically based on how quickly
        // the device is able to actually render, maybe through onLayout on
        // the cells. Throttle it on the ListView side and coalesce by dropping
        // old values.
        let throttleMs = 16 * 5;

        if (!this.isHandlingMove) {
          this.isHandlingMove = true;

          setTimeout(() => {
            this.isHandlingMove = false;
            let letter = this._findTouchedLetter(gestureState.moveY);
            if (letter) {
              this.props.onTouchLetter && this.props.onTouchLetter(letter);
            }
          }, throttleMs);
        }
      },
      onPanResponderTerminate: this._onPanResponderEnd.bind(this),
      onPanResponderRelease: this._onPanResponderEnd.bind(this),
    });
  }

  _onPanResponderEnd() {
    requestAnimationFrame(() => {
      this.props.onTouchEnd && this.props.onTouchEnd();
    });
  }

  _findTouchedLetter(y) {
    let top = y - (this.absContainerTop || 0);

    if (top >= 1 && top <= this.containerHeight) {
      return Alphabet[Math.round((top/this.containerHeight) * 26)]
    }
  }

  _onLayout({nativeEvent: {layout: {y: y, height: h}}}) {
    this.absContainerTop = y;
    this.containerHeight = h;
  }

  render() {
    this._letters = this._letters || (
      Alphabet.map((letter) => <LetterPicker letter={letter} key={letter} />)
    );

    return (
      <View
        {...this._panResponder.panHandlers}
        onLayout={this._onLayout.bind(this)}
        style={{paddingHorizontal: 5, backgroundColor: 'transparent', justifyContent: 'center'}}>
        <View>
          {this._letters}
        </View>
      </View>
    );
  }

}

class ContactCell extends React.Component {
  constructor(props) {
    super(props);
  }

  render() {
    return (
      <View style={styles.cell}>
        <View style={styles.placeholderCircle} />
        <Text style={styles.name}>
          {this.props.data}
        </Text>
      </View>
    );
  }
}

// <SwipeToDelete onDelete={() => {}} style={styles.swipeContainer}>
// </SwipeToDelete>

let styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 25,
    backgroundColor: '#fff',
  },
  swipeContainer: {
  },
  alphabetSidebar: {
    position: 'absolute',
    backgroundColor: 'transparent',
    top: 0,
    bottom: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderCircle: {
    width: 50,
    height: 50,
    backgroundColor: '#ccc',
    borderRadius: 25,
    marginRight: 10,
  },
  name: {
    fontSize: 15,
  },
  cell: {
    height: 95,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomColor: '#ccc',
    borderBottomWidth: 1,
  },
});

AppRegistry.registerComponent('main', () => Main);
