// Simple example bot that runs continuously and logs messages
setInterval(() => {
  console.log('Sample bot is alive at', new Date().toISOString());
}, 1000 * 30);

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
