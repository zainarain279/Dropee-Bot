const fs = require('fs');
const path = require('path');
const axios = require('axios');
const colors = require('colors');
const readline = require('readline');

class DropeeAPIClient {
    constructor() {
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
            this.log('Error loading config, using defaults', 'error');
            this.config = {
                maxUpgradePrice: 5000
            };
        }
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
            this.log(`Token saved for user ${userId}`, 'success');
        } catch (error) {
            this.log(`Error saving token: ${error.message}`, 'error');
        }
    }

    isTokenExpired(token) {
        if (!token) return true;

        try {
            const [, payload] = token.split('.');
            if (!payload) return true;

            const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());
            const now = Math.floor(Date.now() / 1000);

            if (!decodedPayload.exp) {
                this.log('Token vĩnh cửu', 'warning');
                return false;
            }

            const expirationDate = new Date(decodedPayload.exp * 1000);
            const isExpired = now > decodedPayload.exp;

            this.log(`Token expires after: ${expirationDate.toLocaleString()}`, 'custom');
            this.log(`Token status: ${isExpired ? 'Expired' : 'Still usable'}`, isExpired ? 'warning' : 'success');

            return isExpired;
        } catch (error) {
            this.log(`Token check error: ${error.message}`, 'error');
            return true;
        }
    }

    async getValidToken(userId, initData) {
        const existingToken = this.tokens[userId];
        
        if (existingToken && !this.isTokenExpired(existingToken)) {
            this.log('Use usable tokens', 'success');
            return existingToken;
        }

        this.log('Token not found or expired, login...', 'warning');
        const loginResult = await this.login(initData);
        
        if (loginResult.success) {
            this.saveToken(userId, loginResult.token);
            return loginResult.token;
        }
        
        throw new Error(`No valid token found: ${loginResult.error}`);
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [*] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`.magenta);
                break;        
            case 'error':
                console.log(`[${timestamp}] [!] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [*] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [*] ${msg}`.blue);
        }
    }

    async countdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            readline.cursorTo(process.stdout, 0);
            process.stdout.write(`===== Wait ${i} seconds to continue loop =====`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        this.log('', 'info');
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
            const response = await axios.post(url, payload, { headers: this.headers });
            if (response.status === 200) {
                return { 
                    success: true, 
                    token: response.data.token,
                    referralCode: response.data.referralCode,
                    firstName: response.data.firstName
                };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async checkReferral(token, referralCode) {
        const url = `${this.baseUrl}/player-by-referral-code`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };
        const payload = {
            referralCode: referralCode
        };

        try {
            const response = await axios.post(url, payload, { headers });
            if (response.status === 200) {
                return { success: true, data: response.data };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async completeOnboarding(token) {
        const url = `${this.baseUrl}/actions/onboarding/done`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            const response = await axios.post(url, {}, { headers });
            if (response.status === 200) {
                return { success: true };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    generateEnergyDistribution(totalEnergy, parts) {
        if (totalEnergy < parts) {
            return null;
        }

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
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            let totalCoins = 0;
            
            const energyParts = this.generateEnergyDistribution(count, 10);
            if (!energyParts) {
                this.log('Not enough energy to do 10 taps (need at least 10)', 'error');
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

                const response = await axios.post(url, payload, { headers });
                if (response.status === 200) {
                    totalCoins = response.data.coins;
                    this.log(`Tap times ${i + 1}/10: ${energyParts[i]} energy | Duration: ${duration}ms`, 'custom');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    return { success: false, error: response.data.message };
                }
            }

            return { success: true, data: { coins: totalCoins } };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async syncGame(token) {
        const url = `${this.baseUrl}/sync`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            const response = await axios.post(url, {}, { headers });
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
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async performDailyCheckin(token) {
        const url = `${this.baseUrl}/actions/tasks/daily-checkin`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };
        const payload = {
            timezoneOffset: -420
        };

        try {
            const response = await axios.post(url, payload, { headers });
            if (response.status === 200) {
                return { success: true, data: response.data };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    shouldPerformCheckin(lastCheckin) {
        if (!lastCheckin) return true;
        
        const today = new Date().toISOString().split('T')[0];
        const lastCheckinDate = new Date(lastCheckin);
        const nextDay = new Date(lastCheckinDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const nextDayString = nextDay.toISOString().split('T')[0];
        
        return today === nextDayString;
    }

    async getFortuneWheelState(token) {
        const url = `${this.baseUrl}/fortune-wheel`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            const response = await axios.get(url, { headers });
            if (response.status === 200) {
                return { success: true, data: response.data.state };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async spinFortuneWheel(token) {
        const url = `${this.baseUrl}/actions/fortune-wheel/spin`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };
        const payload = { version: 3 };

        try {
            const response = await axios.post(url, payload, { headers });
            if (response.status === 200) {
                return { success: true, data: response.data };
            } else {
                return { success: false, error: response.data.message };
            }
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
            this.log('No spins available!', 'warning');
            return;
        }

        this.log(`Have ${availableSpins} available spins!`, 'info');

        for (let i = 0; i < availableSpins; i++) {
            this.log(`Spin in progress ${i + 1}/${availableSpins}...`, 'info');
            const spinResult = await this.spinFortuneWheel(token);
            
            if (spinResult.success) {
                const prize = spinResult.data.prize;
                let prizeMsg = '';
                
                if (prize.type === 'usdt') {
                    prizeMsg = `${prize.amount} USDT`;
                } else {
                    prizeMsg = `${prize.id}`;
                }
                
                this.log(`Spin successful! Received: ${prizeMsg}`, 'success');
                
                await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
                this.log(`Failed spin: ${spinResult.error}`, 'error');
            }
        }
    }

    async getConfig(token) {
        const url = `${this.baseUrl}/config`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };

        try {
            const response = await axios.get(url, { headers });
            if (response.status === 200) {
                return { success: true, data: response.data };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async completeTask(token, taskId) {
        const url = `${this.baseUrl}/actions/tasks/action-completed`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };
        const payload = { taskId };

        try {
            const response = await axios.post(url, payload, { headers });
            return { success: response.status === 200 };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async claimTaskReward(token, taskId) {
        const url = `${this.baseUrl}/actions/tasks/done`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };
        const payload = { taskId };

        try {
            const response = await axios.post(url, payload, { headers });
            return { success: response.status === 200, data: response.data };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async handleTasks(token) {
        try {
            const configResult = await this.getConfig(token);
            if (!configResult.success) {
                this.log(`Unable to get configuration: ${configResult.error}`, 'error');
                return;
            }

            const incompleteTasks = configResult.data.config.tasks.filter(task => !task.isDone);
            if (incompleteTasks.length === 0) {
                this.log('All missions completed!', 'success');
                return;
            }

            for (const task of incompleteTasks) {
                this.log(`Processing task: ${task.title}...`, 'info');

                const completeResult = await this.completeTask(token, task.id);
                if (!completeResult.success) {
                    this.log(`Unable to complete quest action ${task.id}: ${completeResult.error}`, 'error');
                    continue;
                }

                if (task.claimDelay > 0) {
                    this.log(`Wait ${task.claimDelay} seconds to get reward...`, 'warning');
                    await new Promise(resolve => setTimeout(resolve, task.claimDelay * 1000));
                }

                const claimResult = await this.claimTaskReward(token, task.id);
                if (claimResult.success) {
                    this.log(`Do the task ${task.title} success | reward ${task.reward}`, 'success');
                } else {
                    this.log(`Cannot receive quest rewards ${task.id}: ${claimResult.error}`, 'error');
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            this.log(`Task processing error: ${error.message}`, 'error');
        }
    }

    async purchaseUpgrade(token, upgradeId) {
        const url = `${this.baseUrl}/actions/upgrade`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };
        const payload = { upgradeId };

        try {
            const response = await axios.post(url, payload, { headers });
            if (response.status === 200) {
                return { success: true, data: response.data };
            } else {
                return { success: false, error: response.data.message };
            }
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async handleUpgrades(token, availableCoins) {
        try {
            const configResult = await this.getConfig(token);
            if (!configResult.success) {
                this.log(`Unable to get configuration: ${configResult.error}`, 'error');
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
                this.log('No upgrades available!', 'warning');
                return;
            }

            for (const upgrade of upgrades) {
                if (upgrade.price > availableCoins) {
                    this.log(`Not enough coins to upgrade ${upgrade.name} (${upgrade.price} coins)`, 'warning');
                    continue;
                }

                this.log(`Upgrading ${upgrade.name} (${upgrade.price} coins, +${upgrade.profitDelta} profit)...`, 'info');
                const purchaseResult = await this.purchaseUpgrade(token, upgrade.id);
                
                if (purchaseResult.success) {
                    this.log(`Upgrade ${upgrade.name} success!`, 'success');
                    availableCoins -= upgrade.price;
                    
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    this.log(`Upgrade ${upgrade.name} failure: ${purchaseResult.error}`, 'error');
                }
            }
        } catch (error) {
            this.log(`Upgrade processing error: ${error.message}`, 'error');
        }
    }

    async listFriends(token) {
        const url = `${this.baseUrl}/friends`;
        const headers = {
            ...this.headers,
            "Authorization": `Bearer ${token}`
        };
        const payload = {
            referrerCode: "6-lWnwV7vtL"
        };

        try {
            await axios.post(url, payload, { headers });
        } catch (error) {}
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
    
        while (true) {
            for (let i = 0; i < data.length; i++) {
                const initData = data[i];
                const userData = JSON.parse(decodeURIComponent(initData.split('user=')[1].split('&')[0]));
                const userId = userData.id;
                const firstName = userData.first_name;
    
                console.log(`========== Account ${i + 1} | ${firstName.green} ==========`);
                
                try {
                    const token = await this.getValidToken(userId, initData);
                    this.log(`Use tokens for accounts ${userId}`, 'success');
                    await this.listFriends(token);
                    const referralResult = await this.checkReferral(token, "6-lWnwV7vtL");
                    if (referralResult.success) {
                        this.log(`Check referral success!`, 'success');
                    } else {
                        this.log(`Referral check failed: ${referralResult.error}`, 'error');
                    }
    
                    const syncResult = await this.syncGame(token);
                    if (syncResult.success) {
                        this.log('Data synchronization successful!', 'success');
                        this.log(`Coins: ${syncResult.data.coins}`, 'custom');
                        this.log(`Profit: ${syncResult.data.profit}`, 'custom');
                        this.log(`Energy: ${syncResult.data.energy.available}/${syncResult.data.energy.max}`, 'custom');
    
                        if (!syncResult.data.onboarding) {
                            this.log('Detected onboarding is not complete, processing...', 'warning');
                            const onboardingResult = await this.completeOnboarding(token);
                            if (onboardingResult.success) {
                                this.log('Successfully completed onboarding!', 'success');
                            } else {
                                this.log(`Onboarding completion failed: ${onboardingResult.error}`, 'error');
                            }
                        }
    
                        if (syncResult.data.energy.available >= 10) {
                            this.log(`Detect ${syncResult.data.energy.available} energy, doing tap...`, 'warning');
                            const tapResult = await this.tap(token, syncResult.data.energy.available);
                            if (tapResult.success) {
                                this.log(`Tap success | Balance: ${tapResult.data.coins}`, 'success');
                            } else {
                                this.log(`Tap failed: ${tapResult.error}`, 'error');
                            }
                        } else {
                            this.log('Not enough energy to tap (need at least 10)', 'warning');
                        }
    
                        const lastCheckin = syncResult.data.tasks?.dailyCheckin?.lastCheckin || '';
                        if (this.shouldPerformCheckin(lastCheckin)) {
                            this.log('Daily roll call in progress...', 'warning');
                            const checkinResult = await this.performDailyCheckin(token);
                            if (checkinResult.success) {
                                this.log('Roll call successful!', 'success');
                            } else {
                                this.log(`Roll call failed: ${checkinResult.error}`, 'error');
                            }
                        } else {
                            this.log('Roll call today!', 'warning');
                        }
    
                        this.log('Check out the lucky spin...', 'info');
                        await this.performFortuneWheelSpins(token);
    
                        this.log('Checking mission...', 'info');
                        await this.handleTasks(token);
    
                        this.log('Checking for available upgrades...', 'info');
                        await this.handleUpgrades(token, syncResult.data.coins);
    
                        const finalSync = await this.syncGame(token);
                        if (finalSync.success) {
                            this.log('=== Final Statistics ===', 'custom');
                            this.log(`Coins: ${finalSync.data.coins}`, 'custom');
                            this.log(`Profit: ${finalSync.data.profit}`, 'custom');
                            this.log(`Energy: ${finalSync.data.energy.available}/${finalSync.data.energy.max}`, 'custom');
                        }
                    } else {
                        this.log(`Data synchronization failed: ${syncResult.error}`, 'error');
                    }
                } catch (error) {
                    this.log(`Account processing error ${userId}: ${error.message}`, 'error');
                    
                    if (error.message.toLowerCase().includes('token')) {
                        delete this.tokens[userId];
                        fs.writeFileSync(this.tokenFile, JSON.stringify(this.tokens, null, 2));
                        this.log(`Invalid token removed from account ${userId}`, 'warning');
                    }
                }
    
                this.log(`Wait 5 seconds before processing next account...`, 'info');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
    
            this.log('=== Complete processing of all accounts ===', 'success');
            await this.countdown(10 * 60);
        }
    }
}

const client = new DropeeAPIClient();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});