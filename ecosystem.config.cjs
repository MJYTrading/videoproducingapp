module.exports = {
  apps: [{
    name: 'video-producer-app',
    script: 'npx',
    args: 'tsx server/index.ts',
    cwd: '/root/video-producer-app',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    max_memory_restart: '500M',
    restart_delay: 3000,
    max_restarts: 10,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
