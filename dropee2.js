const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

class DropeeAPIClient {
    constructor(proxy = null, accountIndex = 0) {
        this.baseUrl = 'https://dropee.clicker-game-api.tropee.com/api/game';
        this.headers = {
            "Accept": "*/*",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept-Language": "vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5",
            "Content-Type": "application/json",
            "Origin": "https://webapp.game.dropee.xyz",
            "Referer": "https://webapp.game.dropee.xyz/",
            "Sec-Ch-Ua": '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            "Sec-Ch-Ua-Mobile": "?1",
            "Sec-Ch-Ua-Platform": '"Android"',
            "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36",
            "X-Preview-Season": "betav2"
        };

        this.accountIndex = accountIndex;
        this.proxyIP = 'Unknown IP';
        this.tokenFile = path.join(__dirname, 'token.json');
        this.loadTokens();

        try {
            const configPath = path.join(__dirname, 'config.json');
            if (fs.existsSync(configPath)) {
                this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } else {
                this.config = {
                    maxUpgradePrice: 500000
                };
                fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
            }
        } catch (error) {
            this.log('Unable to read config file, using default', 'error');
            this.config = {
                maxUpgradePrice: 5000
            };
        }

        this.proxy = proxy;
        if (this.proxy) {
            this.proxyAgent = new HttpsProxyAgent(this.proxy);
            this.axiosInstance = axios.create({
                httpsAgent: this.proxyAgent,
                proxy: false
            });
        } else {
            this.axiosInstance = axios;
        }
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const accountPrefix = `[Account ${this.accountIndex + 1}]`;
        const ipPrefix = `[${this.proxyIP}]`;
        let logMessage = '';
        
        switch(type) {
            case 'success':
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
                break;
            case 'error':
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
                break;
            case 'warning':
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
                break;
            default:
                logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
        }
        
        console.log(`[${timestamp}] ${logMessage}`);
    }

    loadTokens() {
        try {
            if (fs.existsSync(this.tokenFile)) {
                this.tokens = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
            } else {
                this.tokens = {};
                fs.writeFileSync(this.tokenFile, JSON.stringify(this.tokens, null, 2));
            }
        } catch (error) {
            this.log(`Error loading tokens: ${error.message}`, 'error');
            this.tokens = {};
        }
    }

    saveToken(userId, token) {
        try {
            this.tokens[userId] = token;
            fs.writeFileSync(this.tokenFile, JSON.stringify(this.tokens, null, 2));
            this.log(`Tokens saved for the account ${userId}`, 'success');
        } catch (error) {
            this.log(`Token cannot be saved.: ${error.message}`, 'error');
        }
    }

    async getValidToken(userId, initData) {
        const existingToken = this.tokens[userId];

        if (existingToken && !this.isTokenExpired(existingToken)) {
            return existingToken;
        }

        this.log('Token does not exist or has expired, login...', 'warning');
        const loginResult = await this.login(initData);

        if (loginResult.success) {
            this.saveToken(userId, loginResult.token);
            return loginResult.token;
        }

        throw new Error(`No valid token found: ${loginResult.error}`);
    }

    isTokenExpired(token) {
        if (!token) return true;

        try {
            const [, payload] = token.split('.');
            if (!payload) return true;

            const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
            const now = Math.floor(Date.now() / 1000);

            if (!decodedPayload.exp) {
                this.log('Eternal token', 'warning');
                return false;
            }

            return now > decodedPayload.exp;
        } catch (error) {
            this.log(`Error checking token: ${error.message}`, 'error');
            return true;
        }
    }

    async axiosRequest(method, url, data = null, customHeaders = {}) {
        const headers = { ...this.headers, ...customHeaders };

        try {
            const response = await this.axiosInstance({
                method,
                url,
                data,
                headers
            });
            return response;
        } catch (error) {
            throw error;
        }
    }

    async login(initData) {
        const url = `${this.baseUrl}/telegram/me`;
        const payload = {
            initData: initData,
            referrerCode: "6-lWnwV7vtL",
            utmSource: null,
            impersonationToken: null
        };

        try {
            const response = await this.axiosRequest('post', url, payload);
            return response.status === 200 ? 
                { success: true, token: response.data.token } : 
                { success: false, error: response.data.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    generateEnergyDistribution(totalEnergy, parts) {
        if (totalEnergy < parts) return null;

        let remaining = totalEnergy;
        let distribution = [];

        for (let i = 0; i < parts - 1; i++) {
            const maxForThisPart = Math.min(200, remaining - (parts - i - 1));
            const minRequired = remaining - (200 * (parts - i - 1));
            const minValue = Math.max(1, minRequired);
            const maxValue = Math.min(maxForThisPart, remaining - (parts - i - 1));

            const value = Math.floor(Math.random() * (maxValue - minValue + 1)) + minValue;
            distribution.push(value);
            remaining -= value;
        }

        distribution.push(remaining);
        return distribution;
    }

    async tap(token, count) {
        const url = `${this.baseUrl}/actions/tap`;
        const headers = { "Authorization": `Bearer ${token}` };

        try {
            let totalCoins = 0;
            const energyParts = this.generateEnergyDistribution(count, 10);
            
            if (!energyParts) {
                this.log('Not enough energy to tap 10 times (minimum 10)', 'error');
                return { success: false, error: 'Insufficient energy' };
            }

            for (let i = 0; i < energyParts.length; i++) {
                const duration = Math.floor(Math.random() * (40 - 35 + 1)) + 35;
                const payload = {
                    count: energyParts[i],
                    startTimestamp: Math.floor(Date.now() / 1000),
                    duration: duration,
                    availableEnergy: count - energyParts.slice(0, i + 1).reduce((a, b) => a + b, 0)
                };

                const response = await this.axiosRequest('post', url, payload, headers);
                if (response.status === 200) {
                    totalCoins = response.data.coins;
                    this.log(`Tap ${i + 1}/10: ${energyParts[i]} Energy | Time: ${duration}ms`, 'custom');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            return { success: true, data: { coins: totalCoins } };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async syncGame(token) {
        const url = `${this.baseUrl}/sync`;
        const headers = { "Authorization": `Bearer ${token}` };

        try {
            const response = await this.axiosRequest('post', url, {}, headers);
            if (response.status === 200) {
                const stats = response.data.playerStats;
                return {
                    success: true,
                    data: {
                        coins: stats.coins,
                        profit: stats.profit,
                        energy: {
                            available: stats.energy.available,
                            max: stats.energy.max
                        },
                        onboarding: stats.onboarding.done,
                        tasks: stats.tasks
                    }
                };
            }
            return { success: false, error: response.data.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async performDailyCheckin(token) {
        const url = `${this.baseUrl}/actions/tasks/daily-checkin`;
        const headers = { "Authorization": `Bearer ${token}` };
        const payload = { timezoneOffset: -420 };

        try {
            const response = await this.axiosRequest('post', url, payload, headers);
            return response.status === 200 ?
                { success: true, data: response.data } :
                { success: false, error: response.data.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    shouldPerformCheckin(lastCheckin) {
        if (!lastCheckin) return true;

        const today = new Date().toISOString().split('T')[0];
        const lastCheckinDate = new Date(lastCheckin);
        return today !== lastCheckinDate.toISOString().split('T')[0];
    }

    async getFortuneWheelState(token) {
        const url = `${this.baseUrl}/fortune-wheel`;
        const headers = { "Authorization": `Bearer ${token}` };

        try {
            const response = await this.axiosRequest('get', url, null, headers);
            return response.status === 200 ?
                { success: true, data: response.data.state } :
                { success: false, error: response.data.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async spinFortuneWheel(token) {
        const url = `${this.baseUrl}/actions/fortune-wheel/spin`;
        const headers = { "Authorization": `Bearer ${token}` };
        const payload = { version: 3 };

        try {
            const response = await this.axiosRequest('post', url, payload, headers);
            return response.status === 200 ?
                { success: true, data: response.data } :
                { success: false, error: response.data.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async performFortuneWheelSpins(token) {
        const stateResult = await this.getFortuneWheelState(token);
        if (!stateResult.success) {
            this.log(`Unable to check spin status: ${stateResult.error}`, 'error');
            return;
        }

        const availableSpins = stateResult.data.spins.available;
        if (availableSpins <= 0) {
            this.log('There are no spins!', 'warning');
            return;
        }

        this.log(`${availableSpins} available spins!`, 'info');

        for (let i = 0; i < availableSpins; i++) {
            this.log(`Perform rotation ${i + 1}/${availableSpins}...`, 'info');
            const spinResult = await this.spinFortuneWheel(token);

            if (spinResult.success) {
                const prize = spinResult.data.prize;
                const prizeMsg = prize.type === 'usdt' ? `${prize.amount} USDT` : prize.id;
                this.log(`Spin successful! Get: ${prizeMsg}`, 'success');
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                this.log(`Turn failure: ${spinResult.error}`, 'error');
            }
        }
    }

    async getConfig(token) {
        const url = `${this.baseUrl}/config`;
        const headers = { "Authorization": `Bearer ${token}` };

        try {
            const response = await this.axiosRequest('get', url, null, headers);
            return response.status === 200 ?
                { success: true, data: response.data } :
                { success: false, error: response.data.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async completeTask(token, taskId) {
        const url = `${this.baseUrl}/actions/tasks/action-completed`;
        const headers = { "Authorization": `Bearer ${token}` };
        const payload = { taskId };

        try {
            const response = await this.axiosRequest('post', url, payload, headers);
            return { success: response.status === 200 };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async claimTaskReward(token, taskId) {
        const url = `${this.baseUrl}/actions/tasks/done`;
        const headers = { "Authorization": `Bearer ${token}` };
        const payload = { taskId };

        try {
            const response = await this.axiosRequest('post', url, payload, headers);
            return { 
                success: response.status === 200,
                data: response.data 
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async handleTasks(token) {
        try {
            const configResult = await this.getConfig(token);
            if (!configResult.success) {
                this.log(`Cannot get config: ${configResult.error}`, 'error');
                return;
            }

            const incompleteTasks = configResult.data.config.tasks.filter(task => !task.isDone);
            if (incompleteTasks.length === 0) {
                this.log('All missions completed!', 'success');
                return;
            }

            for (const task of incompleteTasks) {
                this.log(`Do the task: ${task.title}...`, 'info');

                const completeResult = await this.completeTask(token, task.id);
                if (!completeResult.success) {
                    this.log(`Unable to complete the task ${task.id}: ${completeResult.error}`, 'error');
                    continue;
                }

                if (task.claimDelay > 0) {
                    this.log(`Wait ${task.claimDelay} seconds to get reward...`, 'warning');
                    await new Promise(resolve => setTimeout(resolve, task.claimDelay * 1000));
                }

                const claimResult = await this.claimTaskReward(token, task.id);
                if (claimResult.success) {
                    this.log(`Mission ${task.title} complete | reward ${task.reward}`, 'success');
                } else {
                    this.log(`Unable to receive quest rewards ${task.id}: ${claimResult.error}`, 'error');
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            this.log(`Error: ${error.message}`, 'error');
        }
    }

    async handleUpgrades(token, availableCoins) {
        try {
            const configResult = await this.getConfig(token);
            if (!configResult.success) {
                this.log(`Cannot get config: ${configResult.error}`, 'error');
                return;
            }

            let upgrades = configResult.data.config.upgrades
                .filter(upgrade =>
                    upgrade.price <= this.config.maxUpgradePrice &&
                    upgrade.price <= availableCoins &&
                    (!upgrade.expiresOn || upgrade.expiresOn > Math.floor(Date.now() / 1000))
                )
                .map(upgrade => ({
                    ...upgrade,
                    roi: upgrade.profitDelta / upgrade.price
                }))
                .sort((a, b) => b.roi - a.roi);

            if (upgrades.length === 0) {
                this.log('No cards need upgrading!', 'warning');
                return;
            }

            for (const upgrade of upgrades) {
                if (upgrade.price > availableCoins) {
                    this.log(`Not enough balance to upgrade card ${upgrade.name} (cần ${upgrade.price} coins)`, 'warning');
                    continue;
                }

                this.log(`Upgrading ${upgrade.name} (${upgrade.price} coins, +${upgrade.profitDelta} profit)...`, 'info');
                const purchaseResult = await this.purchaseUpgrade(token, upgrade.id);

                if (purchaseResult.success) {
                    this.log(`Upgrade ${upgrade.name} success!`, 'success');
                    availableCoins -= upgrade.price;
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    this.log(`Upgrade failed ${upgrade.name}: ${purchaseResult.error}`, 'error');
                }
            }
        } catch (error) {
            this.log(`Error: ${error.message}`, 'error');
        }
    }

    async purchaseUpgrade(token, upgradeId) {
        const url = `${this.baseUrl}/actions/upgrade`;
        const headers = { "Authorization": `Bearer ${token}` };
        const payload = { upgradeId };

        try {
            const response = await this.axiosRequest('post', url, payload, headers);
            return response.status === 200 ?
                { success: true, data: response.data } :
                { success: false, error: response.data.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async checkProxyIP() {
        try {
            const response = await this.axiosInstance.get('https://api.ipify.org?format=json');
            return response.status === 200 ? response.data.ip : 'Unknown IP';
        } catch (error) {
            throw new Error(`Proxy IP check error: ${error.message}`);
        }
    }

    async completeOnboarding(token) {
        const url = `${this.baseUrl}/actions/onboarding/done`;
        const headers = { "Authorization": `Bearer ${token}` };

        try {
            const response = await this.axiosRequest('post', url, {}, headers);
            return response.status === 200 ?
                { success: true } :
                { success: false, error: response.data.message };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

async function processAccount(initData, proxy, accountIndex) {
    const client = new DropeeAPIClient(proxy, accountIndex);
    const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
    const userId = userData.id;
    const firstName = userData.first_name;

    try {
        if (proxy) {
            try {
                client.proxyIP = await client.checkProxyIP();
            } catch (proxyError) {
                client.log(`Proxy error: ${proxyError.message}`, 'error');
                return;
            }
        }

        const token = await client.getValidToken(userId, initData);
        client.log(`Use tokens for accounts ${userId}`, 'success');

        const syncResult = await client.syncGame(token);
        if (syncResult.success) {
            client.log(`Coins: ${syncResult.data.coins} | Profit: ${syncResult.data.profit} | Energy: ${syncResult.data.energy.available}/${syncResult.data.energy.max}`, 'custom');

            if (!syncResult.data.onboarding) {
                client.log('Incomplete onboarding detected, processing...', 'warning');
                const onboardingResult = await client.completeOnboarding(token);
                if (onboardingResult.success) {
                    client.log('Onboarding completed successfully!', 'success');
                } else {
                    client.log(`Onboarding completion failed: ${onboardingResult.error}`, 'error');
                }
            }

            if (syncResult.data.energy.available >= 10) {
                client.log(`Còn ${syncResult.data.energy.available} energy, start tap...`, 'warning');
                const tapResult = await client.tap(token, syncResult.data.energy.available);
                if (tapResult.success) {
                    client.log(`Tap success | Balance: ${tapResult.data.coins}`, 'success');
                } else {
                    client.log(`Tap failed: ${tapResult.error}`, 'error');
                }
            } else {
                client.log('Not enough power to tap (minimum 10)', 'warning');
            }

            const lastCheckin = syncResult.data.tasks?.dailyCheckin?.lastCheckin || '';
            if (client.shouldPerformCheckin(lastCheckin)) {
                client.log('Perform daily check in...', 'warning');
                const checkinResult = await client.performDailyCheckin(token);
                if (checkinResult.success) {
                    client.log('Check-in success!', 'success');
                } else {
                    client.log(`Check-in failure: ${checkinResult.error}`, 'error');
                }
            } else {
                client.log('You checked in today!', 'warning');
            }

            await client.performFortuneWheelSpins(token);
            await client.handleTasks(token);
            await client.handleUpgrades(token, syncResult.data.coins);

            const finalSync = await client.syncGame(token);
            if (finalSync.success) {
                client.log('=== Final Statistics ===', 'custom');
                client.log(`Coins: ${finalSync.data.coins}`, 'custom');
                client.log(`Profit: ${finalSync.data.profit}`, 'custom');
                client.log(`Energy: ${finalSync.data.energy.available}/${finalSync.data.energy.max}`, 'custom');
            }
        } else {
            client.log(`Error: ${syncResult.error}`, 'error');
        }
    } catch (error) {
        client.log(`Account processing error ${userId}: ${error.message}`, 'error');
    }
}

if (isMainThread) {
    const MAX_THREADS = 10;
    const ACCOUNT_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    const LOOP_DELAY = 600 * 1000; // 300 seconds

    async function runWorker(initData, proxy, accountIndex) {
        return new Promise((resolve) => {
            const worker = new Worker(__filename, {
                workerData: { initData, proxy, accountIndex }
            });

            const timeout = setTimeout(() => {
                worker.terminate();
                console.log(`[Account ${accountIndex + 1}] Timed out after 10 minutes`.red);
                resolve();
            }, ACCOUNT_TIMEOUT);

            worker.on('exit', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    async function main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const proxyFile = path.join(__dirname, 'proxy.txt');

        while (true) {
            try {
                const data = fs.readFileSync(dataFile, 'utf8')
                    .replace(/\r/g, '')
                    .split('\n')
                    .filter(Boolean);

                const proxies = fs.readFileSync(proxyFile, 'utf8')
                    .replace(/\r/g, '')
                    .split('\n')
                    .filter(Boolean);

                console.log('=== Start new processing cycle ==='.green);

                for (let i = 0; i < data.length; i += MAX_THREADS) {
                    const batch = data.slice(i, Math.min(i + MAX_THREADS, data.length));
                    const workers = batch.map((initData, index) => 
                        runWorker(initData, proxies[i + index] || null, i + index)
                    );

                    await Promise.all(workers);
                }

                console.log('=== All accounts processed completed ==='.green);
                console.log(`Chờ ${LOOP_DELAY/1000} seconds to continue...`.yellow);
                await new Promise(resolve => setTimeout(resolve, LOOP_DELAY));
            } catch (error) {
                console.error('Main process error:', error);
                await new Promise(resolve => setTimeout(resolve, 60000));
            }
        }
    }

    main().catch(console.error);
} else {
    const { initData, proxy, accountIndex } = workerData;
    processAccount(initData, proxy, accountIndex).catch(console.error);
}