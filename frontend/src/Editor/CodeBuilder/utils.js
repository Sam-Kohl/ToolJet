import _ from 'lodash';
import Fuse from 'fuse.js';

export function getSuggestionKeys(currentState) {
  const suggestionList = [];

  const map = new Map();

  const buildMap = (data, path = '') => {
    const keys = Object.keys(data);
    keys.forEach((key, index) => {
      const value = data[key];
      const _type = Object.prototype.toString.call(value).slice(8, -1);
      const prevType = map.get(path)?.type;

      let newPath = '';
      if (path === '') {
        newPath = key;
      } else if (prevType === 'Array') {
        newPath = `${path}[${index}]`;
      } else {
        newPath = `${path}.${key}`;
      }

      if (_type === 'Object') {
        map.set(newPath, { type: _type });
        buildMap(value, newPath);
      }
      if (_type === 'Array') {
        map.set(newPath, { type: _type });
        buildMap(value, newPath);
      } else {
        map.set(newPath, { type: _type });
      }
    });
  };

  buildMap(currentState, '');
  map.forEach((__, key) => suggestionList.push(key));

  return suggestionList;
}

export function generateHints(word, suggestions) {
  if (word === '') {
    return suggestions;
  }

  const fuse = new Fuse(suggestions);
  return fuse.search(word).map((result) => result.item);
}

export function computeCurrentWord(editor, _cursorPosition, ignoreBraces = false) {
  const cursor = editor.getCursor();
  const line = cursor.line;
  const value = editor.getLine(line);
  const sliced = value.slice(0, _cursorPosition);

  const splitter = ignoreBraces ? ' ' : '{{';

  const split = sliced.split(splitter);
  const splittedWord = split.slice(-1).pop();

  // Check if the word still has spaces, to avoid replacing entire code
  const lastWord = splittedWord.split(' ').slice(-1).pop();

  return lastWord;
}

export function makeOverlay(style) {
  return {
    // eslint-disable-next-line no-unused-vars
    token: function (stream, state) {
      var ch;
      if (stream.match('{{')) {
        while ((ch = stream.next()) != null)
          if (ch === '}' && stream.next() === '}') {
            stream.eat('}');
            return style;
          }
      }
      // eslint-disable-next-line no-empty
      while (stream.next() != null && !stream.match('{{', false)) {}
      return null;
    },
  };
}

export function onBeforeChange(editor, change, ignoreBraces = false) {
  if (!ignoreBraces) {
    const cursor = editor.getCursor();
    const line = cursor.line;
    const ch = cursor.ch;
    const value = editor.getLine(line);
    const isLastCharacterBrace = value.slice(ch - 1, value.length) === '{';

    if (isLastCharacterBrace && change.origin === '+input' && change.text[0] === '{') {
      change.text[0] = '{}}';
      // editor.setCursor({ line: 0, ch: ch })
    }
  }

  return change;
}

function keystrokeChecker(editor) {
  const keyPromise = new Promise((resolve, reject) => {
    editor.on('keyup', function (editor, event) {
      if (event.key == 'Enter' || event.key == 'Backspace') {
        resolve(true);
      }
      reject(false);
    });
  });
  return keyPromise;
}

export function canShowHint(editor, ignoreBraces = false) {
  if (!editor.hasFocus()) return false;

  const cursor = editor.getCursor();
  const line = cursor.line;
  const ch = cursor.ch;
  const value = editor.getLine(line);

  if (ignoreBraces && value.length > 0) return true;

  return value.slice(ch, ch + 2) === '}}';
}

export function handleChange(editor, onChange, suggestions, ignoreBraces = false) {
  let state = editor.state.matchHighlighter;
  editor.addOverlay((state.overlay = makeOverlay(state.options.style)));

  const cursor = editor.getCursor();
  const currentWord = computeCurrentWord(editor, cursor.ch, ignoreBraces);
  const hints = generateHints(currentWord, suggestions);

  const options = {
    alignWithWord: false,
    completeSingle: false,
    hint: function () {
      return {
        from: { line: cursor.line, ch: cursor.ch - currentWord.length },
        to: cursor,
        list: hints,
      };
    },
  };
  if (canShowHint(editor, ignoreBraces)) {
    const keystrokeValue = keystrokeChecker(editor)
      .then((res) => {
        return res;
      })
      .catch((err) => {
        return err;
      });

    const keystrokeCaller = async () => {
      const returnValue = await keystrokeValue;
      if (!returnValue) editor.showHint(options);
    };
    keystrokeCaller();
  }
}
