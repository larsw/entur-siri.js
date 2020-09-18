declare module 'tile38' {

  interface Tile38Opts {
      host:string,
      port:number,
      debug:boolean
  }

  export type Payload = string | any;

  export type SetOptions = {
      expire?:boolean
  }

  export class Tile38 {
    constructor(Tile38Opts);
    set(key:string, id: string, Payload, opts: SetOptions): Promise<any>;
  }

  export type GeoJSON = {
    type: string,
    coordinates: any[]
    properties?: any
  }
}
