import { LanguageSupport, StreamLanguage } from '@codemirror/language';
import { tags } from '@lezer/highlight';

interface LatexState {
  math: false | 'inline' | 'display';
}

function isCommandStart(char: string): boolean {
  return /[A-Za-z@]/.test(char);
}

export const latexStreamLanguage = StreamLanguage.define<LatexState>({
  name: 'latex',
  startState: () => ({ math: false }),
  token(stream, state) {
    if (stream.eatSpace()) return null;

    if (stream.peek() === '%') {
      stream.skipToEnd();
      return 'comment';
    }

    if (stream.match('$$')) {
      state.math = state.math === 'display' ? false : 'display';
      return 'operator';
    }
    if (stream.peek() === '$') {
      stream.next();
      state.math = state.math === 'inline' ? false : 'inline';
      return 'operator';
    }

    if (stream.peek() === '\\') {
      stream.next();
      if (stream.eat('\\')) return 'operator';
      if (stream.eat('(') || stream.eat('[')) {
        state.math = 'inline';
        return 'operator';
      }
      if (stream.eat(')') || stream.eat(']')) {
        state.math = false;
        return 'operator';
      }
      if (stream.eatWhile(isCommandStart)) {
        stream.eat('*');
        return 'keyword';
      }
      stream.next();
      return 'operator';
    }

    if (stream.peek() === '{' || stream.peek() === '}' || stream.peek() === '[' || stream.peek() === ']') {
      stream.next();
      return 'punctuation';
    }

    if (stream.match(/\d+(\.\d+)?/)) return 'number';

    if (state.math) {
      if (stream.match(/[a-zA-Z]+/)) return 'variableName';
      if (stream.match(/[=+\-*/^_<>]/)) return 'operator';
      if (stream.match(/[()|,;:!]/)) return 'punctuation';
      stream.next();
      return 'atom';
    }

    if (stream.peek() === '&' || stream.peek() === '~' || stream.peek() === '^' || stream.peek() === '_') {
      stream.next();
      return 'operator';
    }

    if (stream.match(/[A-Za-z]+/)) return null;
    stream.next();
    return null;
  },
  tokenTable: {
    comment: tags.comment,
    keyword: tags.keyword,
    string: tags.string,
    number: tags.number,
    operator: tags.operator,
    punctuation: tags.punctuation,
    variableName: tags.variableName,
    atom: tags.atom,
  },
});

export function latexLanguage(): LanguageSupport {
  return new LanguageSupport(latexStreamLanguage);
}
