import {NativeDirectionInput} from './presentation.js';
// The two stock selector models reference the arrow/Ctrl and WASD/Tab rows of
// keys_player.bmp respectively. Keep each device's pressed-direction order.
const layouts={GC_KeyboardLayout_1:{ArrowUp:0,ArrowRight:1,ArrowDown:2,ArrowLeft:3},GC_KeyboardLayout_2:{KeyW:0,KeyD:1,KeyS:2,KeyA:3}};
export class GameDevices {
 constructor(settings={},pads=()=>globalThis.navigator?.getGamepads?.()??[]){this.settings=settings;this.pads=pads;this.keys=new Set();this.inputs=Object.fromEntries(Object.keys(layouts).map(k=>[k,new NativeDirectionInput()]));}
 down(code){this.keys.add(code);for(const [name,map]of Object.entries(layouts))if(map[code]!==undefined)this.inputs[name].down(code,map[code]);return Object.values(layouts).some(m=>m[code]!==undefined)||['ControlLeft','ControlRight','Tab'].includes(code);}
 up(code){this.keys.delete(code);for(const input of Object.values(this.inputs))input.up(code);}
 clear(){this.keys.clear();for(const input of Object.values(this.inputs))input.clear();}
 device(property='Player1InputDevice'){return this.settings[property]??(property==='Player2InputDevice'?'GC_KeyboardLayout_2':'GC_KeyboardLayout_1');}
 pad(property){const match=/^joystick_(\d+)$/.exec(this.device(property));return match?this.pads()[Number(match[1])]:null;}
 direction(property){const name=this.device(property);if(this.inputs[name])return this.inputs[name].direction;
  const pad=this.pad(property);if(!pad)return null;const x=pad.axes[0]??0,y=pad.axes[1]??0;
  if(pad.buttons[12]?.pressed)return 0;if(pad.buttons[13]?.pressed)return 2;if(pad.buttons[14]?.pressed)return 3;if(pad.buttons[15]?.pressed)return 1;
  if(Math.max(Math.abs(x),Math.abs(y))<.5)return null;return Math.abs(x)>Math.abs(y)?x>0?1:3:y>0?2:0;
 }
 fire(property){const name=this.device(property);return name==='GC_KeyboardLayout_1'?this.keys.has('ControlLeft')||this.keys.has('ControlRight'):name==='GC_KeyboardLayout_2'?this.keys.has('Tab'):!!this.pad(property)?.buttons[0]?.pressed;}
}
