export const CARLOG_COMPANY = Object.freeze({
  key: 'carlog-connection',
  name: 'Car Log Connection',
  defaultTimeZone: 'America/New_York',
  currency: 'USD'
});

export type DeploymentEnvironment = 'development' | 'test' | 'production';

export interface RuntimeConfig {
  environment: DeploymentEnvironment;
  publicWebUrl: string;
  adminUrl: string;
  apiUrl: string;
}
