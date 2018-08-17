var tokens: {[x: string]: string} = {};

export  function getToken(token: string, fn: (err: Error, value: string) => void): void {
    var value = tokens[token];
    return fn(null, value);
}

export function deleteToken(token: string, fn: (err: Error) => void) {
    delete tokens[token];
    return fn(null);
}

export function setToken(token: string, value: string, fn: (err: Error) => void) {
    tokens[token] = value;
    return fn(null);
}

export function createToken(): string {
  var token = randomString(64);
  return token;
}

// from https://github.com/jaredhanson/passport-remember-me/blob/master/examples/login/utils.js
function randomString(len: number) {
  var buf = []
  , chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  , charlen = chars.length;

  for (var i = 0; i < len; ++i) {
    buf.push(chars[getRandomInt(0, charlen - 1)]);
  }

  return buf.join('');
};

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
	
