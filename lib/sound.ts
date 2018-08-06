var mpg321 = require('mpg321');
var async = require('async');
var logger = require('tracer').colorConsole({
    dateformat : 'dd/mm/yyyy HH:MM:ss.l',
    level : 3
    // 0:'test', 1:'trace', 2:'debug', 3:'info', 4:'warn', 5:'error'
});

const language = 'fr';

var volume: number = 100; // normal volume, middle

function SayNow (msg: string, callback: Function) {
  var encodedMsg = encodeURIComponent(msg);
  mpg321().outputdevice('alsa').audiodevice('hw:0,0')
    .file('http://translate.google.com/translate_tts?tl=' +
	  language +
	  '&ie=utf-8&client=tw-ob&q=' +
	  encodedMsg).stereo().gain(volume).exec(callback);
  logger.info(msg);
};

var sayQueue = async.queue(function (task: {message: string}, callback: Function) {
  SayNow(task.message, callback);
}, 1);

export function say(msg: string, callback?: Function) {
  sayQueue.push({
    message: msg
  }, callback);
};

export function setDefaultVolume(vol: number) {
  volume = vol;
};
