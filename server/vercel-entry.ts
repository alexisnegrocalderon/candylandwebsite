import { createApp } from './_core/app';
import { registerVercelSsr } from './_core/vercelSsr';

const app = createApp();
registerVercelSsr(app);

export default app;
