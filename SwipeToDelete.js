/**
 * Copyright 2015-present 650 Industries. All rights reserved.
 *
 * @providesModule SwipeToDelete
 */
'use strict';

import React from 'react';
import {
  PropTypes,
} from 'react-native';

import SwipeActions from 'react-native-swipe-actions';

// TODO: show confirmation dialog after user clicks 'Delete'
export default class SwipeToDelete extends React.Component {
  static propTypes = {
    onDelete: PropTypes.func.isRequired,
    events: PropTypes.object,
  };

  static CLOSE_SWIPE_ACTIONS_EVENT = 'swipe-close-event';

  render() {
    let actions = [
      {
        text: 'Delete',
        onPress: this.props.onDelete,
        backgroundColor: 'red',
      },
    ];

    return (
      <SwipeActions actions={actions} events={this.props.events}>
        {React.Children.only(this.props.children)}
      </SwipeActions>
    );
  }
}
