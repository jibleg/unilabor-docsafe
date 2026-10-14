// PM2: pm2 start ecosystem.config.cjs && pm2 save
// El agente lee agent.config.json y queue.sqlite de su carpeta, por eso fija el cwd aqui.
module.exports = {
  apps: [{
    name: 'docsafe-agente',
    script: 'src/agent.js',
    cwd: __dirname,
    autorestart: true,
    restart_delay: 5000,
  }],
};
