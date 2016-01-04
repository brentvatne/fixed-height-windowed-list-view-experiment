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
      <View style={styles.sectionPickerSidebar}>
        <SectionPicker
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
            incrementDelay={17}
            initialNumToRender={8}
            pageSize={Platform.OS === 'ios' ? 8 : 8}
            maxNumToRender={40}
            numToRenderAhead={this.state.isTouching ? 0 : 30}
            numToRenderBehind={10}
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

class ContactCell extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      placeholder: true,
    };
  }

  componentDidMount() {
    this._mounted = true;
    this.scheduleRemovePlaceholder();
  }

  scheduleRemovePlaceholder() {
    this.placeholderCallback = requestIdleCallback((deadline) => {
      if (!this._mounted) {
        return;
      }

      if ((!deadline.timeRemaining || deadline.timeRemaining() >= 2)) {
        this.setState({placeholder: false});
      } else {
        this.scheduleRemovePlaceholder();
      }
    });
  }

  componentWillUnmount() {
    this._mounted = false;
    cancelIdleCallback(this.placeholderCallback);
  }

  render() {
    if (this.state.placeholder) {
      return this.renderPlaceholder();
    } else {
      return this.renderFull();
    }
  }

  renderPlaceholder() {
    return (
      <View style={styles.cell}>
        { Platform.OS === 'ios' ?
            <Image source={{uri: 'https://avatars1.githubusercontent.com/u/90494?v=3&s=100'}} style={{width: 50, height: 50, borderRadius: 25, marginLeft: 5, marginRight: 10}} /> :
            <View style={{width: 65}} /> }
        <Text style={styles.name}>
          {this.props.data}
        </Text>
      </View>
    )
  }

  renderFull() {
    return (
      <View style={styles.cell}>
        <Image source={{uri: 'https://avatars1.githubusercontent.com/u/90494?v=3&s=100'}} style={{width: 50, height: 50, borderRadius: 25, marginLeft: 5, marginRight: 10}} />
        <Text style={styles.name}>
          {this.props.data}
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
  sectionPickerSidebar: {
    position: 'absolute',
    backgroundColor: 'transparent',
    top: 0,
    bottom: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderBar: {
    backgroundColor: '#eee',
    height: 20,
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
