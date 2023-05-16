declare module 'tuyapi' {
    import { EventEmitter } from 'events';

    interface TuyaDeviceOptions {
        ip?: string;
        port?: number;
        id: string;
        gwID?: string;
        key: string;
        productKey?: string;
        version?: number|string;
        nullPayloadOnJSONError?: boolean;
        issueGetOnConnect?: boolean;
        issueRefreshOnConnect?: boolean;
        issueRefreshOnPing?: boolean;
    }

    type UnionTypes = Object|number|string|boolean;

    interface Object {
        [key: string]: Object|number|string|boolean|Array<UnionTypes>;
    }

    interface DPSObject {
        dps: Object;
    }

    interface GetOptions {
        schema?: boolean;
        dps?: number;
        cid?: string;
    }

    interface RefreshOptions extends GetOptions {
        requestedDPS?: Array<number>;
    }

    interface SingleSetOptions {
        dps: number;
        set: string|number|boolean;
        cid?: string;
        multiple?: boolean;
        shouldWaitForResponse?: boolean;
    }
    interface MultipleSetOptions {
        multiple: boolean;
        data: Object;
        shouldWaitForResponse?: boolean;
    }

    interface FindOptions {
        timeout?: number;
        all?: boolean;
    }

    type EventDataFn = (
        data: DPSObject,
        commandByte: number,
        sequenceN: number
    ) => void;

    interface Events {
        "connected": () => void;
        "heartbeat": () => void;
        "disconnected": () => void;
        "error": (error: Error) => void;
        "dp-refresh": EventDataFn;
        "data": EventDataFn;
    }

    export default class TuyaDevice extends EventEmitter {
        constructor(options: TuyaDeviceOptions);

        connect(): Promise<boolean>;
        disconnect(): void;
        isConnected(): boolean;

        get(options: GetOptions): Promise<DPSObject|number|boolean|string>;
        refresh(options: RefreshOptions): Promise<DPSObject>;
        set(options: SingleSetOptions|MultipleSetOptions): Promise<DPSObject>;
        toggle(property: number): Promise<boolean>;
        find(options?: FindOptions): Promise<boolean|Array<DPSObject>>;

        on<K extends keyof Events>(event: K, listener: Events[K]): this;
    }

}
