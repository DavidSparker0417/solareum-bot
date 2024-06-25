import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();
if (process.env.NODE_ENV == ('development' || 'development ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.development') });
} else if (process.env.NODE_ENV == ('production' || 'production ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env') });
} else if (process.env.NODE_ENV == ('staging' || 'staging ')) {
	dotenv.config({ path: path.join(__dirname, '..', '.env.staging') });
}

const { createClient } = require('ioredis')
let redisClient
export function createNewRedisClient() {
	if (!redisClient) {
		redisClient = createClient(process.env.REDIS_SERVER)
	}
	
	return redisClient
}

export function createNewSubscribedClient(channels: string[], messageProc: (channel: string, message: string) => void, bufferProc?: (channel: Buffer, message: Buffer) => void) {
	const redis = createClient(process.env.REDIS_SERVER)

	redis.subscribe(...channels, (err, count) => {
		if (err) {
		  // Just like other commands, subscribe() can fail for some reasons,
		  // ex network issues.
		  console.error("Failed to subscribe: %s", err.message);
		} else {
		  // `count` represents the number of channels this client are currently subscribed to.
		  console.log(
			`Subscribed successfully! This client is currently subscribed to ${count} channels.`
		  );
		}
	  });
	  
	  redis.on("message", (channel, message) => {
		messageProc(channel, message)
	  });
	  
	  // There's also an event called 'messageBuffer', which is the same as 'message' except
	  // it returns buffers instead of strings.
	  // It's useful when the messages are binary data.
	  redis.on("messageBuffer", (channel, message) => {
		// Both `channel` and `message` are buffers.
		if (bufferProc) {
			bufferProc(channel, message)
		}
	  });
}