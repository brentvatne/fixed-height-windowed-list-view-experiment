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
import randomColor from 'randomcolor';

let names = require('./names');
names = _.groupBy(require('./names'), (name) => name[0].toUpperCase());


let lastFrame = new Date();

function showLastFrameTime() {
  requestAnimationFrame(() => {
    let thisFrame = new Date();
    let delta = thisFrame - lastFrame;

    if (delta > 60) {
      console.log("warning - frame time: " + (thisFrame - lastFrame));
    }
    lastFrame = thisFrame;
    showLastFrameTime();
  });
}

showLastFrameTime();

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
    this._alphabetInstance = this._alphabetInstance || (
      <View style={styles.alphabetSidebar} shouldRasterizeIOS>
        <AlphabetPicker
          onTouchStart={() => { this.setState({isTouching: true}) }}
          onTouchEnd={() => { requestAnimationFrame(() => { this.setState({isTouching: false}) })}}
          onTouchLetter={this._onTouchLetter.bind(this)} />
      </View>
    );

    return (
      <View style={{flex: 1}}>
        <View style={styles.container}>
          <FixedHeightWindowedListView
            ref={view => this._listView = view}
            dataSource={this.state.dataSource}
            renderCell={this._renderCell.bind(this)}
            renderSectionHeader={this._renderSectionHeader.bind(this)}
            getHeightForRowInSection={this._getHeightForRowInSection}
            incrementDelay={16}
            initialNumToRender={15}
            pageSize={Platform.OS === 'ios' ? 15 : 8}
            maxNumToRender={70}
            numToRenderAhead={this.state.isTouching ? 0 : 40}
          />
        </View>

        {this._alphabetInstance}
      </View>
    );
  }

  _onTouchLetter(letter) {
    this._listView.scrollToSectionBuffered(letter);
  }

  _renderSectionHeader(data) {
    return (
      <View style={{height: 35, justifyContent: 'center', backgroundColor: '#eee', paddingLeft: 10}}>
        <Text>{data.sectionId}</Text>
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

        this.tapTimeout = setTimeout(() => {
          this._onTouchLetter(this._findTouchedLetter(gestureState.y0));
        }, 100);
      },
      onPanResponderMove: (evt, gestureState) => {
        clearTimeout(this.tapTimeout);
        this._onTouchLetter(this._findTouchedLetter(gestureState.moveY));
      },
      onPanResponderTerminate: this._onPanResponderEnd.bind(this),
      onPanResponderRelease: this._onPanResponderEnd.bind(this),
    });
  }

  _onTouchLetter(letter) {
    letter && this.props.onTouchLetter && this.props.onTouchLetter(letter);
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
        style={{paddingHorizontal: 5, backgroundColor: '#fff', borderRadius: 1, justifyContent: 'center'}}>
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
        <View style={[styles.placeholderCircle, {backgroundColor: randomColor()}]} />
        <Text style={styles.name}>
          {this.props.data} {this.props.data.split('').reverse().join('')}
        </Text>
      </View>
    );
  }
}


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
    marginLeft: 5,
  },
  name: {
    fontSize: 15,
  },
  cell: {
    height: 95,
    borderBottomColor: '#ccc',
    borderBottomWidth: 1,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
  },
});

AppRegistry.registerComponent('main', () => Main);
