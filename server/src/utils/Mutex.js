// server/src/utils/Mutex.js

class Mutex {
    constructor() {
        this._queue = [];
        this._locked = false;
    }

    lock() {
        return new Promise((resolve) => {
            const release = () => {
                if (this._queue.length > 0) {
                    const next = this._queue.shift();
                    next();
                } else {
                    this._locked = false;
                }
            };

            if (this._locked) {
                this._queue.push(() => resolve(release));
            } else {
                this._locked = true;
                resolve(release);
            }
        });
    }

    async runExclusive(callback) {
        const release = await this.lock();
        try {
            return await callback();
        } finally {
            release();
        }
    }
}

module.exports = Mutex;
