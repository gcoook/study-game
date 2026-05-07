/* ============================================
   学习闯关 - 游戏化学习反馈系统 核心逻辑
   ============================================
   这个文件包含了整个应用的所有功能：
   1. 数据管理（localStorage 读写）
   2. 游戏化数值计算（XP、排名、连胜）
   3. 页面切换和UI更新
   4. 任务管理（增删改查）
   5. 每日结算机制（22:00结算、缓冲期、零点重置）
   6. 动画效果
   ============================================ */

// ============================================
// 全局常量定义
// ============================================

/** 全省中考总人数 */
const TOTAL_STUDENTS = 133279;

/** 必做任务每星经验值（1星=50, 2星=100, 3星=150, 4星=200, 5星=250） */
const XP_PER_STAR_REQUIRED = 50;

/** 拓展任务每星经验值（1星=100, 2星=200, 3星=300, 4星=400, 5星=500） */
const XP_PER_STAR_EXTRA = 100;

/** 连胜加成系数：每连胜一天增加10%，最高3倍（即连胜20天封顶） */
const STREAK_BONUS_PER_DAY = 0.1;
const MAX_STREAK_MULTIPLIER = 3.0;

/** 掉段机制：当天零经验，排名随机下降20~30名 */
const RANK_DROP_MIN = 20;
const RANK_DROP_MAX = 30;

/** 每日结算时间（22:00） */
const SETTLEMENT_HOUR = 22;

/** 缓冲期时长（30分钟，即22:00-22:30） */
const BUFFER_MINUTES = 30;

/** 排名历史最多保存的天数 */
const MAX_HISTORY_DAYS = 7;

/** localStorage 存储用的键名 */
const STORAGE_KEY = 'study_game_data';

/** 科目名称映射 */
const SUBJECT_NAMES = {
    chinese: '语文',
    math: '数学',
    english: '英语',
    politics: '政治',
    history: '历史',
    geo: '地理'
};

// ============================================
// 应用主对象
// ============================================
// 使用一个全局对象 `app` 来管理所有功能，
// 这样可以避免全局变量污染，代码更有组织性。
const app = {

    // ---------- 用户数据 ----------
    // 所有需要持久化的数据都存在这个对象里
    data: {
        nickname: '',           // 用户昵称
        initialRank: 0,         // 中考初始排名
        currentRank: 0,         // 当前排名
        totalXP: 0,             // 累计总经验值
        streakDays: 0,          // 连胜天数（连续完成至少1个任务的天数）
        lastActiveDate: '',     // 上次活跃日期（格式：YYYY-MM-DD）
        todayXP: 0,             // 今日获得的经验值
        todayCompletedTasks: 0, // 今日完成的任务数
        tasks: [],              // 任务列表（包含今天和之前的任务）
        rankHistory: [],        // 排名历史记录（最近7天）
        isSetup: false,         // 是否已完成初始设置
        selectedStars: 1,       // 当前选择的星级（1-5）
        settlementDate: '',     // 上次结算日期
        selectedSubject: 'chinese', // 当前选中的科目
        presets: {              // 每个科目的预设任务
            chinese: ['背诵古诗', '阅读理解', '写作文', '练字'],
            math: ['做练习题', '整理错题', '背诵公式', '预习新课'],
            english: ['背单词', '听力练习', '阅读理解', '写作练习'],
            politics: ['背诵知识点', '整理笔记', '做选择题', '看新闻'],
            history: ['背诵时间线', '整理事件', '做材料题', '看纪录片'],
            geo: ['看地图', '背诵地形', '做气候题', '整理笔记']
        }
    },

    // ============================================
    // 初始化：应用启动时执行
    // ============================================
    init() {
        // 从 localStorage 加载保存的数据
        this.loadData();

        // 如果用户已经设置过，直接进入主界面
        if (this.data.isSetup) {
            this.showMainPage();
        } else {
            // 否则显示设置页面
            this.showSetupPage();
        }

        // 给任务输入框绑定回车键事件
        // 按回车 = 点击添加按钮
        const taskInput = document.getElementById('task-input');
        if (taskInput) {
            taskInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.addTask();
                }
            });
        }

        // 绑定星级选择器点击事件
        document.querySelectorAll('#star-selector .star').forEach(star => {
            star.addEventListener('click', () => {
                this.selectStar(parseInt(star.dataset.star));
            });
        });

        // 绑定类型切换事件，切换类型时更新XP显示
        document.querySelectorAll('input[name="task-type"]').forEach(radio => {
            radio.addEventListener('change', () => this.updateStarXPDisplay());
        });

        // 每秒更新倒计时
        this.updateCountdown();
        setInterval(() => this.updateCountdown(), 1000);

        // 每分钟检查是否需要结算/重置
        setInterval(() => {
            this.dailyReset();
            this.dailySettlement();
        }, 60000);

        // 初始化星级显示
        this.updateStarXPDisplay();

        // 绑定科目选择
        const subjectBtns = document.querySelectorAll('.subject-btn');
        subjectBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectSubject(btn.dataset.subject);
            });
        });

        // 初始化预设任务显示
        this.renderPresets();
    },

    // ============================================
    // 数据持久化：保存和加载
    // ============================================

    /**
     * 将数据保存到 localStorage
     * 每次数据变化后都应该调用这个方法
     */
    saveData() {
        try {
            // JSON.stringify 把对象转成字符串才能存到 localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.error('保存数据失败:', e);
        }
    },

    /**
     * 从 localStorage 加载数据
     * 应用启动时调用
     */
    loadData() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                // JSON.parse 把字符串转回对象
                const parsed = JSON.parse(saved);
                // 用 Object.assign 把保存的数据合并到 this.data
                // 这样即使新增了字段也不会丢失
                Object.assign(this.data, parsed);
            }
            // 确保presets有默认值
            if (!this.data.presets || Object.keys(this.data.presets).length === 0) {
                this.data.presets = {
                    chinese: ['背诵古诗', '阅读理解', '写作文', '练字'],
                    math: ['做练习题', '整理错题', '背诵公式', '预习新课'],
                    english: ['背单词', '听力练习', '阅读理解', '写作练习'],
                    politics: ['背诵知识点', '整理笔记', '做选择题', '看新闻'],
                    history: ['背诵时间线', '整理事件', '做材料题', '看纪录片'],
                    geo: ['看地图', '背诵地形', '做气候题', '整理笔记']
                };
            }
            // 确保有选中的科目
            if (!this.data.selectedSubject) {
                this.data.selectedSubject = 'chinese';
            }
        } catch (e) {
            console.error('加载数据失败:', e);
        }
    },

    // ============================================
    // 页面切换
    // ============================================

    /**
     * 显示设置页面（首次使用）
     */
    showSetupPage() {
        document.getElementById('setup-page').style.display = 'flex';
        document.getElementById('main-page').style.display = 'none';
    },

    /**
     * 显示主界面
     */
    showMainPage() {
        document.getElementById('setup-page').style.display = 'none';
        document.getElementById('main-page').style.display = 'block';

        // 执行每日检查（重置和结算）
        this.dailyReset();
        this.dailySettlement();

        // 更新所有界面数据
        this.updateAllUI();
    },

    /**
     * 切换底部Tab页
     * @param {string} tabName - Tab名称：'home'、'tasks'、'ranking'
     */
    switchTab(tabName) {
        // 1. 移除所有Tab的激活状态
        document.querySelectorAll('.tab-content').forEach(el => {
            el.classList.remove('active');
        });
        document.querySelectorAll('.tab-item').forEach(el => {
            el.classList.remove('active');
        });

        // 2. 激活选中的Tab
        document.getElementById('tab-' + tabName).classList.add('active');
        document.querySelector(`.tab-item[data-tab="${tabName}"]`).classList.add('active');

        // 3. 如果切换到排行页，重新绘制图表
        if (tabName === 'ranking') {
            this.renderRankingChart();
            this.renderRankingDetail();
        }
    },

    // ============================================
    // 首次设置 - 开始游戏
    // ============================================

    /**
     * 用户点击"开始冒险"按钮时调用
     * 验证输入并初始化数据
     */
    startGame() {
        const nicknameInput = document.getElementById('nickname-input');
        const rankInput = document.getElementById('rank-input');

        const nickname = nicknameInput.value.trim();
        const rank = parseInt(rankInput.value);

        // 验证昵称不能为空
        if (!nickname) {
            this.shakeElement(nicknameInput);
            return;
        }

        // 验证排名必须是有效数字
        if (!rank || rank < 1 || rank > TOTAL_STUDENTS) {
            this.shakeElement(rankInput);
            return;
        }

        // 初始化用户数据
        this.data.nickname = nickname;
        this.data.initialRank = rank;
        this.data.currentRank = rank;
        this.data.totalXP = 0;
        this.data.streakDays = 0;
        this.data.lastActiveDate = this.getTodayStr();
        this.data.todayXP = 0;
        this.data.todayCompletedTasks = 0;
        this.data.tasks = [];
        this.data.selectedStars = 1;
        this.data.settlementDate = '';
        this.data.rankHistory = [
            {
                date: this.getTodayStr(),
                rank: rank,
                change: 0
            }
        ];
        this.data.isSetup = true;

        // 保存数据
        this.saveData();

        // 切换到主界面
        this.showMainPage();
    },

    // ============================================
    // 每日结算系统
    // ============================================

    /**
     * 检查当前是否在缓冲期内（22:00-22:30）
     * 缓冲期内完成的任务XP减半
     * @returns {boolean} 是否在缓冲期内
     */
    isBufferPeriod() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        return hour === SETTLEMENT_HOUR && minute < BUFFER_MINUTES;
    },

    /**
     * 执行每日结算
     * 在22:00时自动调用，根据当日XP更新排名或执行掉段
     */
    dailySettlement() {
        const today = this.getTodayStr();
        // 今天已结算过，跳过
        if (this.data.settlementDate === today) return;

        // 检查当前时间是否已到结算时间（22:00之后）
        const now = new Date();
        const settlementTime = new Date();
        settlementTime.setHours(SETTLEMENT_HOUR, 0, 0, 0);
        if (now < settlementTime) return;

        if (this.data.todayCompletedTasks === 0) {
            // 当天零经验 → 掉段
            this.applyRankDrop();
        } else {
            // 有经验 → 根据当日总XP更新排名
            this.updateRankByDailyXP(this.data.todayXP);
        }

        // 记录排名历史
        this.addRankHistory(today, this.data.currentRank);

        // 标记今天已结算
        this.data.settlementDate = today;
        this.saveData();
    },

    /**
     * 零点重置
     * 每天零点自动执行：清零当日XP、清空任务列表、记录排名历史
     */
    dailyReset() {
        const today = this.getTodayStr();
        // 今天已经重置过，跳过
        if (this.data.lastActiveDate === today) return;

        // 先执行昨天的结算（如果还没结算）
        this.dailySettlement();

        // 计算距离上次活跃过了多少天
        const lastDate = this.data.settlementDate || this.data.lastActiveDate;
        const daysDiff = lastDate ? this.getDaysDiff(lastDate, today) : 1;

        // 更新连胜天数
        if (daysDiff === 1) {
            // 昨天有完成任务（todayCompletedTasks > 0 在结算时已记录）
            // 注意：结算后todayCompletedTasks可能已被重置，需要通过结算记录判断
            // 这里简化处理：如果昨天结算了且有XP，则连胜+1
            if (this.data.settlementDate && this.data.settlementDate !== today) {
                // 昨天已结算，说明昨天有活跃
                this.data.streakDays++;
            }
        } else if (daysDiff > 1) {
            // 超过1天没登录，连胜中断
            this.data.streakDays = 0;
        }

        // 重置当日数据
        this.data.todayXP = 0;
        this.data.todayCompletedTasks = 0;
        this.data.lastActiveDate = today;

        // 清理旧任务（只保留今天的任务）
        this.data.tasks = this.data.tasks.filter(t => t.date === today);

        this.saveData();
    },

    /**
     * 执行掉段：排名随机下降20~30名
     */
    applyRankDrop() {
        // 生成20到30之间的随机数
        const drop = Math.floor(Math.random() * (RANK_DROP_MAX - RANK_DROP_MIN + 1)) + RANK_DROP_MIN;
        // 排名数字变大 = 排名下降（第1名最好，第50万名最差）
        this.data.currentRank = Math.min(
            this.data.currentRank + drop,
            TOTAL_STUDENTS  // 不能超过总人数
        );
    },

    /**
     * 根据当日总XP计算排名提升（每日结算时调用）
     * 公式：排名提升量 = 当日总XP × (当前排名 / 总人数) × 0.1
     * 排名越高（数字越小），相同XP提升越少
     * @param {number} dailyXP - 当日获得的总经验值
     */
    updateRankByDailyXP(dailyXP) {
        if (dailyXP <= 0) return;
        const ratio = this.data.currentRank / TOTAL_STUDENTS;
        const improvement = Math.round(dailyXP * ratio * 0.1);
        this.data.currentRank = Math.max(1, this.data.currentRank - improvement);
    },

    /**
     * 添加一条排名历史记录
     * @param {string} date - 日期字符串
     * @param {number} rank - 当时的排名
     */
    addRankHistory(date, rank) {
        // 计算与上一次记录的排名变化
        const lastHistory = this.data.rankHistory[this.data.rankHistory.length - 1];
        const change = lastHistory ? rank - lastHistory.rank : 0;
        // 注意：change > 0 表示排名下降（数字变大），change < 0 表示排名上升

        this.data.rankHistory.push({
            date: date,
            rank: rank,
            change: change
        });

        // 只保留最近7天的记录
        if (this.data.rankHistory.length > MAX_HISTORY_DAYS) {
            this.data.rankHistory = this.data.rankHistory.slice(-MAX_HISTORY_DAYS);
        }
    },

    // ============================================
    // 星级选择器交互
    // ============================================

    /**
     * 选择星级
     * @param {number} n - 星级（1-5）
     */
    selectStar(n) {
        this.data.selectedStars = n;

        // 更新星星UI
        document.querySelectorAll('#star-selector .star').forEach(star => {
            const starNum = parseInt(star.dataset.star);
            star.classList.toggle('active', starNum <= n);
        });

        // 更新XP显示
        this.updateStarXPDisplay();
    },

    /**
     * 根据当前选择的类型和星级更新XP显示
     */
    updateStarXPDisplay() {
        const typeRadio = document.querySelector('input[name="task-type"]:checked');
        const taskType = typeRadio ? typeRadio.value : 'required';
        const stars = this.data.selectedStars || 1;
        const xpPerStar = taskType === 'extra' ? XP_PER_STAR_EXTRA : XP_PER_STAR_REQUIRED;
        const totalXP = xpPerStar * stars;

        const displayEl = document.getElementById('star-xp-display');
        if (displayEl) {
            displayEl.textContent = totalXP + ' XP';
        }
    },

    // ============================================
    // 任务管理系统
    // ============================================

    /**
     * 添加新任务
     */
    addTask() {
        const input = document.getElementById('task-input');
        const text = input.value.trim();

        // 验证任务内容不能为空
        if (!text) {
            this.shakeElement(input);
            return;
        }

        // 获取选中的任务类型
        const typeRadio = document.querySelector('input[name="task-type"]:checked');
        const taskType = typeRadio ? typeRadio.value : 'required';

        // 创建新任务对象
        const task = {
            id: Date.now(),                      // 用时间戳作为唯一ID
            text: text,                          // 任务内容
            type: taskType,                      // 任务类型：required必做 / extra拓展
            subject: this.data.selectedSubject,  // 添加科目
            stars: this.data.selectedStars || 1, // 星级1-5
            completed: false,                    // 是否已完成
            date: this.getTodayStr(),            // 所属日期
            createdAt: Date.now()                // 创建时间
        };

        // 添加到任务列表
        this.data.tasks.push(task);

        // 清空输入框
        input.value = '';

        // 保存数据并刷新界面
        this.saveData();
        this.renderTaskList();
    },

    /**
     * 切换任务完成状态
     * @param {number} taskId - 任务ID
     */
    toggleTask(taskId) {
        // 找到对应的任务
        const task = this.data.tasks.find(t => t.id === taskId);
        if (!task) return;

        // 如果任务还没完成，现在要完成它
        if (!task.completed) {
            task.completed = true;
            this.data.todayCompletedTasks++;

            // 根据任务类型和星级计算基础XP
            const xpPerStar = task.type === 'extra' ? XP_PER_STAR_EXTRA : XP_PER_STAR_REQUIRED;
            const baseXP = xpPerStar * task.stars;

            // 计算连胜加成
            const multiplier = this.getStreakMultiplier();
            let xp = Math.round(baseXP * multiplier);

            // 检查是否在缓冲期内（22:00-22:30），XP减半
            if (this.isBufferPeriod()) {
                xp = Math.round(xp / 2);
            }

            // 更新经验值（不再实时更新排名）
            this.data.todayXP += xp;
            this.data.totalXP += xp;

            // 播放XP飞出动画
            this.showXPAnimation(xp);

        } else {
            // 任务已完成，不允许取消（防止刷XP）
            return;
        }

        // 保存数据并刷新界面
        this.saveData();
        this.renderTaskList();
        this.updateAllUI();
    },

    /**
     * 删除任务
     * @param {number} taskId - 任务ID
     */
    deleteTask(taskId) {
        // 找到任务索引
        const index = this.data.tasks.findIndex(t => t.id === taskId);
        if (index === -1) return;

        const task = this.data.tasks[index];

        // 如果任务已完成，需要扣除对应的XP（不再实时更新排名）
        if (task.completed) {
            const xpPerStar = task.type === 'extra' ? XP_PER_STAR_EXTRA : XP_PER_STAR_REQUIRED;
            const baseXP = xpPerStar * task.stars;
            const multiplier = this.getStreakMultiplier();
            let xp = Math.round(baseXP * multiplier);

            // 如果当时在缓冲期内，扣除的也是减半后的XP
            if (this.isBufferPeriod()) {
                xp = Math.round(xp / 2);
            }

            this.data.todayXP = Math.max(0, this.data.todayXP - xp);
            this.data.totalXP = Math.max(0, this.data.totalXP - xp);
            this.data.todayCompletedTasks = Math.max(0, this.data.todayCompletedTasks - 1);
        }

        // 从列表中移除
        this.data.tasks.splice(index, 1);

        // 保存数据并刷新界面
        this.saveData();
        this.renderTaskList();
        this.updateAllUI();
    },

    // ============================================
    // 游戏化数值计算
    // ============================================

    /**
     * 获取当前连胜加成倍率
     * 公式：1 + 连胜天数 × 0.1，最高3倍
     * @returns {number} 加成倍率，例如 1.5 表示1.5倍
     */
    getStreakMultiplier() {
        const multiplier = 1 + this.data.streakDays * STREAK_BONUS_PER_DAY;
        return Math.min(multiplier, MAX_STREAK_MULTIPLIER);
    },

    // ============================================
    // 结算倒计时
    // ============================================

    /**
     * 更新结算倒计时显示
     * 显示距离22:00结算的剩余时间，或缓冲期剩余时间
     */
    updateCountdown() {
        const now = new Date();
        const settlement = new Date();
        settlement.setHours(SETTLEMENT_HOUR, 0, 0, 0);

        let diff = settlement - now;
        let status = '正常';

        if (diff <= 0) {
            // 已过结算时间，检查是否在缓冲期内
            const bufferEnd = new Date();
            bufferEnd.setHours(SETTLEMENT_HOUR, BUFFER_MINUTES, 0, 0);
            diff = bufferEnd - now;
            status = '缓冲期';

            if (diff <= 0) {
                // 缓冲期也过了，显示距离明天结算的时间
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(SETTLEMENT_HOUR, 0, 0, 0);
                diff = tomorrow - now;
                status = '已结算';
            }
        }

        // 计算时分秒
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);

        const countdownEl = document.getElementById('countdown-time');
        if (countdownEl) {
            countdownEl.textContent =
                `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }

        const statusEl = document.getElementById('countdown-status');
        if (statusEl) {
            statusEl.textContent = status;
            statusEl.className = 'countdown-status' + (status === '缓冲期' ? ' buffer' : '');
        }
    },

    // ============================================
    // UI 更新方法
    // ============================================

    /**
     * 更新所有界面元素
     * 在数据变化后统一调用
     */
    updateAllUI() {
        this.updateHeader();
        this.updateHomeStats();
        this.renderHomeTrendChart();
        this.updateBonusCard();
        this.renderTaskList();
        this.updateCountdown();
        this.renderTodoList();
    },

    /**
     * 更新顶部标题栏信息
     */
    updateHeader() {
        document.getElementById('header-nickname').textContent = this.data.nickname;
        document.getElementById('header-streak-num').textContent = this.data.streakDays;
    },

    /**
     * 更新首页的数据概览
     */
    updateHomeStats() {
        // 当前排名
        const rankEl = document.getElementById('current-rank');
        rankEl.textContent = this.formatNumber(this.data.currentRank);

        // 排名变动指示
        const changeEl = document.getElementById('rank-change');
        const lastHistory = this.data.rankHistory[this.data.rankHistory.length - 1];
        if (lastHistory && lastHistory.change !== 0) {
            const change = lastHistory.change;
            if (change < 0) {
                // 排名上升（数字变小）
                changeEl.textContent = '\u2191 ' + this.formatNumber(Math.abs(change));
                changeEl.className = 'rank-change up';
            } else {
                // 排名下降（数字变大）
                changeEl.textContent = '\u2193 ' + this.formatNumber(change);
                changeEl.className = 'rank-change down';
            }
        } else {
            changeEl.textContent = '';
            changeEl.className = 'rank-change';
        }

        // 排名进度条（排名越靠前，进度条越长）
        const progress = ((1 - this.data.currentRank / TOTAL_STUDENTS) * 100).toFixed(2);
        document.getElementById('rank-progress').style.width = progress + '%';

        // 排名百分比
        const percentile = ((1 - this.data.currentRank / TOTAL_STUDENTS) * 100).toFixed(2);
        document.getElementById('rank-percentile').textContent = '前 ' + percentile + '%';

        // 今日XP
        document.getElementById('today-xp').textContent = this.formatNumber(this.data.todayXP);

        // 总XP
        document.getElementById('total-xp').textContent = this.formatNumber(this.data.totalXP);

        // 连胜天数
        document.getElementById('streak-days').textContent = this.data.streakDays;

        // 今日完成任务数
        document.getElementById('today-tasks').textContent = this.data.todayCompletedTasks;
    },

    /**
     * 更新加成卡片显示
     */
    updateBonusCard() {
        const multiplier = this.getStreakMultiplier();
        const bonusPercent = Math.round((multiplier - 1) * 100);
        const desc = bonusPercent > 0
            ? `连胜${this.data.streakDays}天，加成 x${multiplier.toFixed(1)}（+${bonusPercent}%）`
            : '完成今日任务即可开启连胜加成！';

        document.getElementById('bonus-desc').textContent = desc;
    },

    /**
     * 渲染首页待办清单
     */
    renderTodoList() {
        const todoListEl = document.getElementById('todo-list');
        const todoEmptyEl = document.getElementById('todo-empty');
        const today = this.getTodayStr();

        // 获取今日未完成的任务
        const undoneTasks = this.data.tasks.filter(t => t.date === today && !t.completed);

        // 如果没有未做任务，显示空状态
        if (undoneTasks.length === 0) {
            todoListEl.style.display = 'none';
            todoEmptyEl.style.display = 'block';
            return;
        }

        // 显示列表，隐藏空状态
        todoListEl.style.display = 'flex';
        todoEmptyEl.style.display = 'none';

        // 获取加成倍率用于计算XP
        const multiplier = this.getStreakMultiplier();

        // 生成待办列表HTML
        todoListEl.innerHTML = undoneTasks.map(task => {
            const baseXP = task.type === 'extra' ? XP_PER_STAR_EXTRA : XP_PER_STAR_REQUIRED;
            const taskXP = Math.round(baseXP * task.stars * multiplier);
            const subjectName = SUBJECT_NAMES[task.subject] || '其他';
            const typeLabel = task.type === 'extra' ? '⭐' : '📝';

            return `
                <div class="todo-item" data-id="${task.id}">
                    <div class="todo-checkbox" onclick="app.toggleTask(${task.id})"></div>
                    <div class="todo-content">
                        <div class="todo-text">${this.escapeHtml(task.text)}</div>
                        <div class="todo-meta">${typeLabel} ${subjectName} ${'★'.repeat(task.stars)}</div>
                    </div>
                    <div class="todo-xp">+${taskXP} XP</div>
                </div>
            `;
        }).join('');
    },

    // ============================================
    // 任务列表渲染
    // ============================================

    /**
     * 渲染任务列表
     */
    renderTaskList() {
        const listEl = document.getElementById('task-list');
        const emptyEl = document.getElementById('empty-tasks');
        const today = this.getTodayStr();

        // 获取今天的任务
        const todayTasks = this.data.tasks.filter(t => t.date === today);

        // 更新任务统计
        const doneCount = todayTasks.filter(t => t.completed).length;
        document.getElementById('tasks-done-count').textContent = doneCount;
        document.getElementById('tasks-total-count').textContent = todayTasks.length;

        // 如果没有任务，显示空状态
        if (todayTasks.length === 0) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'block';
            return;
        }

        emptyEl.style.display = 'none';

        // 获取当前加成倍率，用于显示任务XP
        const multiplier = this.getStreakMultiplier();

        // 生成任务HTML
        // 未完成的任务排在前面，已完成的排在后面
        const sorted = [...todayTasks].sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            return b.createdAt - a.createdAt;
        });

        listEl.innerHTML = sorted.map(task => {
            // 根据任务类型和星级计算XP
            const xpPerStar = task.type === 'extra' ? XP_PER_STAR_EXTRA : XP_PER_STAR_REQUIRED;
            const baseXP = xpPerStar * task.stars;
            const taskXP = Math.round(baseXP * multiplier);

            // 任务类型标签
            const typeLabel = task.type === 'extra' ? '\u2B50拓展' : '\uD83D\uDCDD必做';
            const typeClass = task.type === 'extra' ? 'extra' : 'required';

            // 星级显示
            const starsDisplay = '\u2605'.repeat(task.stars);

            // 科目标签
            const subjectName = SUBJECT_NAMES[task.subject] || '其他';
            const subjectBadge = `<span class="subject-badge">${subjectName}</span>`;

            return `
            <div class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <button class="task-check" onclick="app.toggleTask(${task.id})">
                    ${task.completed ? '&#10003;' : ''}
                </button>
                <div class="task-content">
                    <div class="task-header">
                        ${subjectBadge}
                        <span class="task-type-badge ${typeClass}">${typeLabel}</span>
                        <span class="task-stars">${starsDisplay}</span>
                        <span class="task-xp">${task.completed ? '+' + taskXP + ' XP' : taskXP + ' XP'}</span>
                    </div>
                    <span class="task-text">${this.escapeHtml(task.text)}</span>
                </div>
                <button class="task-delete" onclick="app.deleteTask(${task.id})" title="删除任务">
                    &times;
                </button>
            </div>
        `}).join('');
    },

    // ============================================
    // 科目选择和预设任务管理
    // ============================================

    /**
     * 切换科目
     * @param {string} subject - 科目代码
     */
    selectSubject(subject) {
        // 更新当前选中的科目
        this.data.selectedSubject = subject;

        // 更新科目按钮的active状态
        document.querySelectorAll('.subject-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.subject === subject);
        });

        // 重新渲染预设任务列表
        this.renderPresets();

        // 保存数据
        this.saveData();
    },

    /**
     * 渲染预设任务列表
     */
    renderPresets() {
        const presetListEl = document.getElementById('preset-list');
        if (!presetListEl) return;

        // 获取当前选中科目的预设列表
        const presets = this.data.presets[this.data.selectedSubject] || [];

        // 生成HTML
        if (presets.length === 0) {
            presetListEl.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">暂无预设任务</span>';
            return;
        }

        presetListEl.innerHTML = presets.map((preset, index) => `
            <span class="preset-item" onclick="app.fillPresetToInput('${this.escapeHtml(preset)}')">${this.escapeHtml(preset)}</span>
        `).join('');
    },

    /**
     * 打开预设管理弹窗
     */
    openPresetManager() {
        const modal = document.getElementById('preset-modal');
        if (!modal) return;

        // 显示弹窗
        modal.style.display = 'flex';

        // 更新弹窗中的科目名称
        const subjectName = SUBJECT_NAMES[this.data.selectedSubject] || '其他';
        const currentSubjectEl = document.getElementById('current-subject-name');
        if (currentSubjectEl) {
            currentSubjectEl.textContent = subjectName;
        }

        // 渲染管理列表
        this.renderPresetManageList();

        // 清空输入框
        const input = document.getElementById('preset-input');
        if (input) input.value = '';
    },

    /**
     * 关闭预设管理弹窗
     */
    closePresetManager() {
        const modal = document.getElementById('preset-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    /**
     * 渲染预设管理列表
     */
    renderPresetManageList() {
        const listEl = document.getElementById('preset-manage-list');
        if (!listEl) return;

        // 获取当前科目的预设列表
        const presets = this.data.presets[this.data.selectedSubject] || [];

        if (presets.length === 0) {
            listEl.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 20px; font-size: 13px;">暂无预设任务，请添加</div>';
            return;
        }

        listEl.innerHTML = presets.map((preset, index) => `
            <div class="preset-manage-item">
                <span>${this.escapeHtml(preset)}</span>
                <button class="btn-delete-preset" onclick="app.deletePreset(${index})">删除</button>
            </div>
        `).join('');
    },

    /**
     * 添加新预设
     */
    addPreset() {
        const input = document.getElementById('preset-input');
        if (!input) return;

        const text = input.value.trim();
        if (!text) {
            this.shakeElement(input);
            return;
        }

        // 添加到当前科目的presets数组
        if (!this.data.presets[this.data.selectedSubject]) {
            this.data.presets[this.data.selectedSubject] = [];
        }
        this.data.presets[this.data.selectedSubject].push(text);

        // 清空输入框
        input.value = '';

        // 重新渲染列表
        this.renderPresetManageList();
        this.renderPresets();

        // 保存数据
        this.saveData();
    },

    /**
     * 删除预设
     * @param {number} index - 预设索引
     */
    deletePreset(index) {
        const presets = this.data.presets[this.data.selectedSubject];
        if (!presets || index < 0 || index >= presets.length) return;

        // 从数组中删除
        presets.splice(index, 1);

        // 重新渲染列表
        this.renderPresetManageList();
        this.renderPresets();

        // 保存数据
        this.saveData();
    },

    /**
     * 填充预设到输入框
     * @param {string} presetText - 预设文本
     */
    fillPresetToInput(presetText) {
        const input = document.getElementById('task-input');
        if (input) {
            input.value = presetText;
            input.focus();
        }
    },

    // ============================================
    // 图表渲染
    // ============================================

    /**
     * 渲染首页的排名趋势折线图（SVG）
     */
    renderHomeTrendChart() {
        const container = document.getElementById('home-trend-chart');
        const history = this.data.rankHistory;

        // 如果没有足够的历史数据，显示提示
        if (history.length < 2) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px;">继续学习，数据会在这里显示</div>';
            return;
        }

        // 图表尺寸
        const width = 320;
        const height = 100;
        const padding = { top: 10, right: 10, bottom: 25, left: 45 };

        // 提取排名数据
        const ranks = history.map(h => h.rank);
        const minRank = Math.min(...ranks);
        const maxRank = Math.max(...ranks);

        // 如果所有排名相同，给一个范围避免除以0
        const range = maxRank - minRank || 1;

        // 计算每个数据点的坐标
        const chartWidth = width - padding.left - padding.right;
        const chartHeight = height - padding.top - padding.bottom;

        const points = ranks.map((rank, i) => {
            const x = padding.left + (i / (ranks.length - 1)) * chartWidth;
            // 注意：排名越小越好，所以Y轴要反转
            const y = padding.top + ((rank - minRank) / range) * chartHeight;
            return { x, y, rank };
        });

        // 生成折线路径
        const linePath = points.map((p, i) =>
            (i === 0 ? 'M' : 'L') + p.x + ',' + p.y
        ).join(' ');

        // 生成渐变填充区域路径
        const areaPath = linePath +
            ` L${points[points.length - 1].x},${height - padding.bottom}` +
            ` L${points[0].x},${height - padding.bottom} Z`;

        // 生成日期标签
        const labels = history.map((h, i) => {
            const x = padding.left + (i / (ranks.length - 1)) * chartWidth;
            const dateStr = h.date.slice(5); // 只取 MM-DD 部分
            return `<text x="${x}" y="${height - 2}" text-anchor="middle" fill="#606080" font-size="9">${dateStr}</text>`;
        }).join('');

        // 生成数据点
        const dots = points.map(p =>
            `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#ffd700" stroke="#0a0a1a" stroke-width="1.5"/>`
        ).join('');

        // 组装SVG
        container.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
                <defs>
                    <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="rgba(255,215,0,0.3)"/>
                        <stop offset="100%" stop-color="rgba(255,215,0,0)"/>
                    </linearGradient>
                </defs>
                <!-- 填充区域 -->
                <path d="${areaPath}" fill="url(#trendGradient)"/>
                <!-- 折线 -->
                <path d="${linePath}" fill="none" stroke="#ffd700" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <!-- 数据点 -->
                ${dots}
                <!-- 日期标签 -->
                ${labels}
            </svg>
        `;
    },

    /**
     * 渲染排行页的柱状图
     */
    renderRankingChart() {
        const container = document.getElementById('ranking-chart');
        const history = this.data.rankHistory;

        if (history.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:13px;">暂无数据</div>';
            return;
        }

        // 提取排名数据
        const ranks = history.map(h => h.rank);
        const maxRank = Math.max(...ranks);
        const minRank = Math.min(...ranks);
        const range = maxRank - minRank || 1;

        // 生成柱状图HTML
        container.innerHTML = history.map((h, i) => {
            // 计算柱子高度百分比
            // 排名越小（越好），柱子越高
            const heightPercent = ((maxRank - h.rank) / range) * 80 + 20; // 最低20%，最高100%
            const dateStr = h.date.slice(5); // MM-DD

            // 根据排名变化决定柱子颜色
            let barColor = 'linear-gradient(180deg, #ffd700, #ff8c00)'; // 默认金色
            if (h.change < 0) {
                barColor = 'linear-gradient(180deg, #00e676, #00c853)'; // 上升 - 绿色
            } else if (h.change > 0) {
                barColor = 'linear-gradient(180deg, #ff6b6b, #ff4444)'; // 下降 - 红色
            }

            return `
                <div class="rank-bar-item">
                    <div class="rank-bar-value">${this.formatNumber(h.rank)}</div>
                    <div class="rank-bar-fill" style="height: ${heightPercent}%; background: ${barColor};"></div>
                    <div class="rank-bar-label">${dateStr}</div>
                </div>
            `;
        }).join('');
    },

    /**
     * 渲染排行页的详细数据列表
     */
    renderRankingDetail() {
        const container = document.getElementById('ranking-detail-list');
        const history = [...this.data.rankHistory].reverse(); // 最新的在前面

        if (history.length === 0) {
            container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;font-size:13px;">暂无数据</div>';
            return;
        }

        container.innerHTML = history.map(h => {
            let changeText = '-';
            let changeClass = '';

            if (h.change < 0) {
                changeText = '\u2191 ' + this.formatNumber(Math.abs(h.change));
                changeClass = 'up';
            } else if (h.change > 0) {
                changeText = '\u2193 ' + this.formatNumber(h.change);
                changeClass = 'down';
            }

            return `
                <div class="ranking-detail-item">
                    <span class="ranking-detail-date">${h.date}</span>
                    <span class="ranking-detail-rank">第 ${this.formatNumber(h.rank)} 名</span>
                    <span class="ranking-detail-change ${changeClass}">${changeText}</span>
                </div>
            `;
        }).join('');
    },

    // ============================================
    // 动画效果
    // ============================================

    /**
     * 显示XP飞出动画
     * 完成任务时，在任务位置显示 "+100 XP" 并向上飘出消失
     * @param {number} xp - 获得的经验值
     */
    showXPAnimation(xp) {
        const container = document.getElementById('xp-animation-container');

        // 创建动画元素
        const flyEl = document.createElement('div');
        flyEl.className = 'xp-fly';
        flyEl.textContent = '+' + xp + ' XP';

        // 随机位置（在屏幕中间偏上的区域）
        const x = window.innerWidth / 2 - 50 + Math.random() * 100;
        const y = window.innerHeight / 2 - 50 + Math.random() * 50;
        flyEl.style.left = x + 'px';
        flyEl.style.top = y + 'px';

        container.appendChild(flyEl);

        // 动画结束后移除元素
        setTimeout(() => {
            flyEl.remove();
        }, 1200);
    },

    /**
     * 显示排名变动动画
     * @param {string} direction - 'up' 上升 或 'down' 下降
     */
    showRankAnimation(direction) {
        const container = document.getElementById('rank-animation-container');

        const flyEl = document.createElement('div');
        flyEl.className = 'rank-fly ' + direction;

        if (direction === 'up') {
            flyEl.textContent = '\u2191 排名上升！';
        } else {
            flyEl.textContent = '\u2193 排名下降...';
        }

        // 在排名显示区域附近显示
        const rankEl = document.getElementById('current-rank');
        const rect = rankEl.getBoundingClientRect();
        flyEl.style.left = (rect.left + rect.width / 2 - 40) + 'px';
        flyEl.style.top = (rect.top + rect.height) + 'px';

        container.appendChild(flyEl);

        // 给排名数字添加跳动动画
        rankEl.classList.add('rank-bounce');
        setTimeout(() => rankEl.classList.remove('rank-bounce'), 500);

        // 动画结束后移除
        setTimeout(() => {
            flyEl.remove();
        }, 1500);
    },

    /**
     * 输入错误时的抖动动画
     * @param {HTMLElement} element - 要抖动的元素
     */
    shakeElement(element) {
        element.style.animation = 'none';
        // 强制重绘
        element.offsetHeight;
        element.style.animation = 'shake 0.5s ease-out';
        element.style.borderColor = 'var(--accent-red)';

        setTimeout(() => {
            element.style.borderColor = 'transparent';
            element.style.animation = '';
        }, 1000);
    },

    // ============================================
    // 工具方法
    // ============================================

    /**
     * 获取今天的日期字符串
     * @returns {string} 格式：YYYY-MM-DD
     */
    getTodayStr() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * 计算两个日期之间的天数差
     * @param {string} dateStr1 - 开始日期 YYYY-MM-DD
     * @param {string} dateStr2 - 结束日期 YYYY-MM-DD
     * @returns {number} 天数差（正数）
     */
    getDaysDiff(dateStr1, dateStr2) {
        const date1 = new Date(dateStr1);
        const date2 = new Date(dateStr2);
        const diffTime = date2.getTime() - date1.getTime();
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    },

    /**
     * 格式化数字（添加千分位逗号）
     * 例如：15000 → 15,000
     * @param {number} num - 要格式化的数字
     * @returns {string} 格式化后的字符串
     */
    formatNumber(num) {
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    },

    /**
     * 转义HTML特殊字符（防止XSS攻击）
     * @param {string} text - 要转义的文本
     * @returns {string} 转义后的安全文本
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// ============================================
// 页面加载完成后初始化应用
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
