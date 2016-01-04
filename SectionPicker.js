import React, {
  Text,
  View,
  PanResponder,
} from 'react-native';

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
export default class SectionPicker extends React.Component {

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
