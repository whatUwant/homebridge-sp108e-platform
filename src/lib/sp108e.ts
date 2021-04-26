/**
 * Porting https://github.com/Lehkeda/SP108E_controller from PHP to JS
 * Porting https://github.com/greenwombat/sp108e from JS to TS
 */
import * as net from 'net';
import colorConvert from 'color-convert';
import { PromiseSocket } from 'promise-socket';
import { ANIMATION_MODES, ANIMATION_MODE_STATIC } from './animationModes';
import { CHIP_TYPES } from './chipTypes';
import { COLOR_ORDERS } from './colorOrders';

// TODO: find out these values?
const WARM_WHITE = 'ff6717';
const NATURAL_WHITE = '?';
const COLD_WHITE = '?';

const CMD_GET_NAME = '77';
const CMD_SET_CHIP_TYPE = '1c';
const CMD_SET_COLOR_ORDER = '3c';
const CMD_SET_SEGMENTS = '2e';
const CMD_SET_LEDS_PER_SEGMENT = '2d';
const CMD_GET_STATUS = '10';
const CMD_PREFIX = '38';
const CMD_SUFFIX = '83';
const CMD_TOGGLE = 'aa';
const CMD_SET_ANIMATION_MODE = '2c';
const CMD_SET_BRIGHTNESS = '2a'; // Param: 00-FF
const CMD_SET_WHITE_BRIGHTNESS = '08'; // Param: 00-FF
const CMD_SET_SPEED = '03'; // Param: 00-FF
const CMD_SET_COLOR = '22'; // RGB: 000000-FFFFFF
const CMD_SET_DREAM_MODE = '2C'; // Param: 1-180
const CMD_SET_DREAM_MODE_AUTO = '06'; // Param: 00

const NO_PARAMETER = '000000';

export interface sp108eOptions {
  host: string;
  port: number;
  type?: string;
}

export interface hsv {
  hue: number;
  saturation: number;
  value: number;
}

export interface sp108eStatus {
  rawResponse: string;
  on: boolean;
  animationMode: number;
  animationModeName: string;
  animationSpeed: number;
  animationSpeedPercentage: number;
  brightness: number;
  brightnessPercentage: number;
  colorOrder: number;
  ledsPerSegment: number;
  numberOfSegments: number;
  color: string;
  hsv: hsv;
  icType: number;
  recordedPatterns: number;
  whiteBrightness: number;
  whiteBrightnessPercentage: number;
}

export default class sp108e {
  constructor(private readonly options: sp108eOptions) {
    this.options = options;
  }

  setChipType = async (chipType: string) => {
    const index = CHIP_TYPES.indexOf(chipType);
    if (index === -1) {
      throw new Error('Invalid chip type: ' + chipType);
    }
    return await this.send(CMD_SET_CHIP_TYPE, this.intToHex(index));
  };

  setColorOrder = async (colorOrder: string) => {
    const index = COLOR_ORDERS.indexOf(colorOrder);
    if (index === -1) {
      throw new Error('Invalid color order: ' + colorOrder);
    }
    return await this.send(CMD_SET_COLOR_ORDER, this.intToHex(index));
  };

  setSegments = async (segments: number) => {
    return await this.send(CMD_SET_SEGMENTS, this.intToHex(segments));
  };

  setLedsPerSegment = async (ledsPerSegment: number) => {
    return await this.send(CMD_SET_LEDS_PER_SEGMENT, this.intToHex(ledsPerSegment));
  };

  /**
   * Toggles the led lights on or off
   */
  toggleOnOff = async () => {
    return await this.send(CMD_TOGGLE, NO_PARAMETER, 17);
  };

  /**
   * Toggles the led lights on
   */
  off = async () => {
    const status = await this.getStatus();
    if (status.on) {
      return await this.toggleOnOff();
    }
  };

  /**
   * Toggles the led lights on
   */
  on = async () => {
    const status = await this.getStatus();
    if (!status.on) {
      return await this.toggleOnOff();
    }
  };

  /**
   * Gets the status of the sp108e, on/off, color, etc
   */
  getStatus = async (): Promise<sp108eStatus> => {
    const response = await this.send(CMD_GET_STATUS, NO_PARAMETER, 17);
    return {
      rawResponse: response,
      on: response.substring(2, 4) === '01',
      animationMode: parseInt(response.substring(4, 6), 16),
      animationModeName: ANIMATION_MODES[response.substring(4, 6).toLowerCase()] ?? 'Unknown',
      animationSpeed: parseInt(response.substring(6, 8), 16),
      animationSpeedPercentage: parseInt(response.substring(6, 8), 16) / 255 * 100,
      brightness: parseInt(response.substring(8, 10), 16),
      brightnessPercentage: parseInt(response.substring(8, 10), 16) / 255 * 100,
      colorOrder: parseInt(response.substring(10, 12), 16),
      ledsPerSegment: parseInt(response.substring(12, 16), 16),
      numberOfSegments: parseInt(response.substring(16, 20), 16),
      color: response.substring(20, 26),
      hsv: this.calculateHsv(response.substring(20, 26)),
      icType: parseInt(response.substring(26, 28), 16),
      recordedPatterns: parseInt(response.substring(28, 30), 16),
      whiteBrightness: parseInt(response.substring(30, 32), 16),
      whiteBrightnessPercentage: parseInt(response.substring(30, 32), 16) / 255 * 100,
    };
  };

  calculateHsv = (hexColor: string): hsv => {
    const hsv = colorConvert.hex.hsv(hexColor);
    return { hue: hsv[0], saturation: hsv[1], value: hsv[2] };
  };

  /**
   * Sets the brightness of the leds
   * @param {integer} brightness any integer from 0-255
   */
  setBrightness = async (brightness: number) => {
    return await this.send(CMD_SET_BRIGHTNESS, this.intToHex(brightness), 0);
  };

  setBrightnessPercentage = async (brightnessPercentage: number) => {
    return await this.setBrightness(Math.ceil(brightnessPercentage / 100 * 255));
  };

  setWhiteBrightness = async (brightness: number) => {
    if (brightness < 1) {
      brightness = 1;
    }
    return await this.send(CMD_SET_WHITE_BRIGHTNESS, this.intToHex(brightness), 0);
  };

  setWhiteBrightnessPercentage = async (brightnessPercentage: number) => {
    return await this.setWhiteBrightness(Math.ceil(brightnessPercentage / 100 * 255));
  };

  /**
   * Sets the color of the leds
   * @param {string} hexColor Hex color without hash. e.g, "FFAABB"
   */
  setColor = async (hexColor: string) => {
    const status = await this.getStatus();
    if (status.animationMode === 0) {
      await this.send(CMD_SET_ANIMATION_MODE, ANIMATION_MODE_STATIC);
    }
    return await this.send(CMD_SET_COLOR, hexColor, 0);
  };

  /**
   * Sets the animation mode of the leds (for single color mode)
   * @param {string} animationMode Use one of the ANIMATION_MODE_XXXX constants. Defaults to ANIMATION_MODE_STATIC
   */
  setAnimationMode = async (animationMode: string) => {
    return await this.send(CMD_SET_ANIMATION_MODE, animationMode);
  };

  /**
   * Sets the speed of the animation
   * @param {integer} speed any integer 0-255
   */
  setAnimationSpeed = async (speed: number) => {
    return await this.send(CMD_SET_SPEED, this.intToHex(speed), 0);
  };

  setAnimationSpeedPercentage = async (speedPercentage: number) => {
    return await this.setAnimationSpeed(Math.ceil(speedPercentage / 100 * 255));
  };

  /**
   * Sets the dreamcolor animation style (0 =auto, 1=rainbow) from 1-180
   * @param {integer} speed any integer 1-180
   */
  setDreamMode = async (mode) => {
    let truncated = Math.min(mode, 180);
    truncated = Math.max(truncated, 1);
    return await this.send(CMD_SET_DREAM_MODE, this.intToHex(mode - 1), 0);
  };

  setDreamModeAuto = async () => {
    return await this.send(CMD_SET_DREAM_MODE_AUTO);
  };

  intToHex = (int: number) => {
    return int.toString(16).padStart(2, '0');
  };

  send = async (cmd: string, parameter = NO_PARAMETER, responseLength = 0): Promise<string> => {
    const client = new PromiseSocket(new net.Socket());
    await client.connect(this.options.port, this.options.host);
    const hex = CMD_PREFIX + parameter.padEnd(6, '0') + cmd + CMD_SUFFIX;
    const rawHex = Buffer.from(hex, 'hex');
    await client.write(rawHex);

    let response;
    if (responseLength > 0) {
      response = await client.read(responseLength);
    }

    await client.end();

    if (responseLength === 0) {
      // Just a little hacky sleep to stop the sp108e getting overwhelmed by sequential writes
      await this.sleep();
    }

    return response ? response.toString('hex') : '';
  };

  sleep = () => {
    return new Promise((resolve) => setTimeout(resolve, 250));
  };
}