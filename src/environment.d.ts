declare global {
  namespace NodeJS {
    interface ProcessEnv {
      GITHUB_AUTH_TOKEN: string;
      NODE_ENV: 'development' | 'production' | 'staging';
      PORT?: string;
      PWD: string;
      TELEGRAM_API_KEY: string;
      LOAD_TESTNET: 'yes' | 'no';
      BOT_MODE: 'polling' | 'webhook';
      REGION: string;
      ACCESS_KEY_ID: string;
      SECRET_ACCESS_KEY: string;
      INBOUND_QUEUE: string;
      PROD_INBOUND_QUEUE: string;
      ZIPKIN_ENDPOINT: string;
      MAX_CORES: 'yes' | 'no';
      ENCRYPT_KEY: string;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
//
export { };
