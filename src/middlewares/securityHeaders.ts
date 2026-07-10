import helmet from 'helmet';

export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: 'same-site' },
});
