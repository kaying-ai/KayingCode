export interface HelloMessage {
  type: "kayingcode-hello";
  version: string;
  platform: string;
  arch: string;
  pid: number;
}

export interface HelloAckMessage {
  type: "kayingcode-hello-ack";
  version: string;
  clientId: string;
}
