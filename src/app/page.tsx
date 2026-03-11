'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { Platform, DetectionEngineState, DashboardStats, RecentDetection, WatchlistEntry, LogEntry } from '@/types';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [engineStates, setEngineStates] = useState<Record<Platform, DetectionEngineState> | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentDetections, setRecentDetections] = useState<RecentDetection[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [config, setConfig] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Auth state - only for auto-trading
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [pendingAutoTradeEnable, setPendingAutoTradeEnable] = useState(false);

  // API test state
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [testingApi, setTestingApi] = useState<string | null>(null);

  // Fetch all data - no auth required for viewing
  const fetchData = useCallback(async () => {
    try {
      const [statusRes, statsRes, watchlistRes, configRes, logsRes] = await Promise.all([
        fetch('/api/detection/status'),
        fetch('/api/stats'),
        fetch('/api/watchlist?limit=20'),
        fetch('/api/config'),
        fetch('/api/logs?limit=100'),
      ]);

      const [status, statsData, watchlistData, configData, logsData] = await Promise.all([
        statusRes.json(),
        statsRes.json(),
        watchlistRes.json(),
        configRes.json(),
        logsRes.json(),
      ]);

      if (status.success) {
        setEngineStates(status.data.engines);
      }
      if (statsData.success) {
        setStats({
          totalTrades: statsData.data.trades.total,
          suspiciousTrades: statsData.data.trades.suspicious,
          watchlistCount: statsData.data.accounts.watchlisted,
          autoTradesToday: statsData.data.autoTrade.todayTrades,
          detectionRate: statsData.data.trades.detectionRate,
          avgInsiderProbability: statsData.data.trades.avgProbability,
        });
        setRecentDetections(statsData.data.recentDetections);
      }
      if (watchlistData.success) {
        setWatchlist(watchlistData.data);
      }
      if (configData.success) {
        setConfig(configData.data);
      }
      if (logsData.success) {
        setLogs(logsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth');
        const data = await res.json();
        setIsAuthenticated(data.authenticated);
      } catch (error) {
        console.error('Auth check failed:', error);
      }
    };
    checkAuth();
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // Start/stop detection
  const toggleDetection = async (platform: Platform, start: boolean) => {
    try {
      const res = await fetch(`/api/detection/${start ? 'start' : 'stop'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        fetchData();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Failed to toggle detection');
    }
  };

  // Login handler
  const handleLogin = async (password: string) => {
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password }),
      });
      const data = await res.json();
      if (data.success) {
        setIsAuthenticated(true);
        setShowLoginModal(false);
        toast.success('Logged in successfully');
        if (pendingAutoTradeEnable) {
          setPendingAutoTradeEnable(false);
          await updateConfig({ autoTradeEnabled: true });
        }
      } else {
        toast.error(data.error || 'Invalid password');
      }
    } catch (error) {
      toast.error('Login failed');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      setIsAuthenticated(false);
      toast.success('Logged out');
    } catch (error) {
      toast.error('Logout failed');
    }
  };

  // Update config - requires auth for auto-trade settings
  const updateConfig = async (updates: any, platform?: Platform) => {
    // If enabling auto-trade, require auth
    if (updates.autoTradeEnabled === true && !isAuthenticated) {
      setPendingAutoTradeEnable(true);
      setShowLoginModal(true);
      return;
    }

    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, updates }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Configuration updated');
        fetchData();
      } else {
        toast.error(data.error);
      }
    } catch (error) {
      toast.error('Failed to update configuration');
    }
  };

  // Format timestamp
  const formatTime = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  // Format probability color
  const getProbabilityColor = (prob: number) => {
    if (prob >= 80) return 'bg-red-500';
    if (prob >= 60) return 'bg-orange-500';
    if (prob >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Test platform API
  const testPlatformApi = async (platform: 'polymarket' | 'kalshi') => {
    setTestingApi(platform);
    try {
      const res = await fetch(`/api/test/${platform}`);
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [platform]: data }));
      if (data.success) {
        toast.success(`${platform} API is working! Response time: ${data.responseTime}ms`);
      } else {
        toast.error(`${platform} API test failed: ${data.error}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      setTestResults(prev => ({ ...prev, [platform]: { success: false, error: errorMsg } }));
      toast.error(`Failed to test ${platform} API`);
    } finally {
      setTestingApi(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <>
      {/* Login Modal - only for auto-trading */}
      <Dialog open={showLoginModal} onOpenChange={setShowLoginModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Authentication Required</DialogTitle>
            <DialogDescription>
              Enter password to enable auto-trading features.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const password = (document.getElementById('login-password') as HTMLInputElement)?.value;
            handleLogin(password);
          }}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Enter password"
                  autoFocus
                  autoComplete="current-password"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowLoginModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoggingIn}>
                {isLoggingIn ? 'Logging in...' : 'Login'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <div className="container mx-auto p-4 max-w-7xl bg-background min-h-screen">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Insider Trade Detection System</h1>
            <p className="text-muted-foreground">Polymarket & Kalshi Monitoring Dashboard</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="auto-refresh">Auto-refresh</Label>
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
            </div>
            <Button onClick={fetchData} variant="outline" size="sm">
              Refresh Now
            </Button>
            {isAuthenticated ? (
              <Button onClick={handleLogout} variant="destructive" size="sm">
                Logout
              </Button>
            ) : (
              <Button onClick={() => setShowLoginModal(true)} variant="outline" size="sm">
                Login (for Auto-Trade)
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="detections">Detections</TabsTrigger>
            <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-4">
            {/* Engine Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {['polymarket', 'kalshi'].map((platform) => {
                const state = engineStates?.[platform as Platform];
                return (
                  <Card key={platform}>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <CardTitle className="text-xl capitalize">{platform}</CardTitle>
                      <Badge variant={state?.isRunning ? 'default' : 'secondary'}>
                        {state?.isRunning ? 'Running' : 'Stopped'}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-muted-foreground">Markets Scanned</p>
                          <p className="text-2xl font-bold">{state?.marketsScanned || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Trades Processed</p>
                          <p className="text-2xl font-bold">{state?.tradesProcessed || 0}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Last Scan</p>
                          <p className="text-sm">
                            {state?.lastScanTime ? formatTime(state.lastScanTime) : 'Never'}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Errors</p>
                          <p className="text-lg">{state?.errors.length || 0}</p>
                        </div>
                      </div>
                      <div className="mt-4 flex gap-2 flex-wrap">
                        <Button
                          onClick={() => toggleDetection(platform as Platform, true)}
                          disabled={state?.isRunning}
                          size="sm"
                        >
                          Start
                        </Button>
                        <Button
                          onClick={() => toggleDetection(platform as Platform, false)}
                          disabled={!state?.isRunning}
                          variant="destructive"
                          size="sm"
                        >
                          Stop
                        </Button>
                        <Button
                          onClick={() => testPlatformApi(platform as 'polymarket' | 'kalshi')}
                          disabled={testingApi === platform}
                          variant="outline"
                          size="sm"
                        >
                          {testingApi === platform ? 'Testing...' : 'Test API'}
                        </Button>
                      </div>
                      {/* Show test results if available */}
                      {testResults[platform] && (
                        <div className={`mt-3 p-2 rounded text-xs ${
                          testResults[platform].success 
                            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                            : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
                        }`}>
                          {testResults[platform].success ? (
                            <div>
                              <div className="font-semibold">✓ API Connected</div>
                              <div>Response: {testResults[platform].responseTime}ms</div>
                              {testResults[platform].tests?.markets && (
                                <div>Markets: {testResults[platform].tests.markets.count} found</div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <div className="font-semibold">✗ Connection Failed</div>
                              <div>{testResults[platform].error}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Total Trades</p>
                    <p className="text-3xl font-bold">{stats?.totalTrades || 0}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Suspicious</p>
                    <p className="text-3xl font-bold text-red-500">{stats?.suspiciousTrades || 0}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Watchlist</p>
                    <p className="text-3xl font-bold">{stats?.watchlistCount || 0}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-muted-foreground text-sm">Avg Probability</p>
                    <p className="text-3xl font-bold">
                      {stats?.avgInsiderProbability?.toFixed(1) || 0}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Detections */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Detections</CardTitle>
                <CardDescription>Latest suspicious trades identified</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Platform</TableHead>
                        <TableHead>Market</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Probability</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentDetections.map((detection) => (
                        <TableRow key={detection.id}>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {detection.platform}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {detection.marketTicker || detection.marketId}
                          </TableCell>
                          <TableCell>${detection.usdValue.toFixed(2)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={detection.insiderProbability || 0}
                                className="w-16 h-2"
                              />
                              <span className="text-sm font-medium">
                                {(detection.insiderProbability || 0).toFixed(0)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatTime(detection.timestamp)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {recentDetections.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            No suspicious trades detected yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Detections Tab */}
          <TabsContent value="detections" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Suspicious Trades</CardTitle>
                <CardDescription>Complete list of flagged trades</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Platform</TableHead>
                        <TableHead>Market</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Probability</TableHead>
                        <TableHead>Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recentDetections.map((detection) => (
                        <TableRow key={detection.id}>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {detection.platform}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {detection.marketTicker || detection.marketId}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {detection.accountAddress.slice(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <Badge variant={detection.outcome === 'YES' ? 'default' : 'secondary'}>
                              {detection.outcome}
                            </Badge>
                          </TableCell>
                          <TableCell>${detection.usdValue.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge className={getProbabilityColor(detection.insiderProbability || 0)}>
                              {(detection.insiderProbability || 0).toFixed(0)}%
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatTime(detection.timestamp)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Watchlist Tab */}
          <TabsContent value="watchlist" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Watchlist</CardTitle>
                <CardDescription>Flagged accounts under monitoring</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Platform</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Probability</TableHead>
                        <TableHead>Flagged At</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {watchlist.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {entry.platform}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {entry.accountAddress.slice(0, 16)}...
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate">
                            {entry.reason}
                          </TableCell>
                          <TableCell>
                            <Badge className={getProbabilityColor(entry.probability)}>
                              {entry.probability.toFixed(0)}%
                            </Badge>
                          </TableCell>
                          <TableCell>{formatTime(entry.flaggedAt)}</TableCell>
                          <TableCell>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={async () => {
                                await fetch(`/api/watchlist?id=${entry.id}`, { method: 'DELETE' });
                                fetchData();
                              }}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {watchlist.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No accounts on watchlist
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System Logs</CardTitle>
                <CardDescription>Activity and error logs</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2 font-mono text-sm">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className={`p-2 rounded ${
                          log.type === 'error'
                            ? 'bg-red-100 dark:bg-red-900'
                            : log.type === 'warning'
                            ? 'bg-yellow-100 dark:bg-yellow-900'
                            : log.type === 'detection'
                            ? 'bg-blue-100 dark:bg-blue-900'
                            : 'bg-gray-100 dark:bg-gray-800'
                        }`}
                      >
                        <span className="text-muted-foreground">
                          [{formatTime(log.timestamp)}]
                        </span>{' '}
                        <span className="capitalize font-semibold">{log.platform}</span>{' '}
                        <span className="uppercase">[{log.type}]</span> {log.message}
                      </div>
                    ))}
                    {logs.length === 0 && (
                      <div className="text-center text-muted-foreground p-4">
                        No logs available
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Config Tab */}
          <TabsContent value="config" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Global Config */}
              <Card>
                <CardHeader>
                  <CardTitle>Global Settings</CardTitle>
                  <CardDescription>System-wide configuration</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="auto-trade">Auto-Trade Enabled</Label>
                      <p className="text-xs text-muted-foreground">Requires login to enable</p>
                    </div>
                    <Switch
                      id="auto-trade"
                      checked={config?.global?.autoTradeEnabled}
                      onCheckedChange={(checked) =>
                        updateConfig({ autoTradeEnabled: checked })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Auto-Trade Amount ($)</Label>
                    <Input
                      type="number"
                      value={config?.global?.autoTradeAmount || 1}
                      onChange={(e) =>
                        updateConfig({ autoTradeAmount: parseFloat(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Probability Threshold: {config?.global?.autoTradeProbabilityThreshold || 70}%</Label>
                    <Slider
                      value={[config?.global?.autoTradeProbabilityThreshold || 70]}
                      onValueChange={([value]) =>
                        updateConfig({ autoTradeProbabilityThreshold: value })
                      }
                      min={50}
                      max={100}
                      step={5}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Retention (days)</Label>
                    <Input
                      type="number"
                      value={config?.global?.dataRetentionDays || 365}
                      onChange={(e) =>
                        updateConfig({ dataRetentionDays: parseInt(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Notification Method</Label>
                    <Select
                      value={config?.global?.notificationMethod || 'telegram'}
                      onValueChange={(value) => updateConfig({ notificationMethod: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="telegram">Telegram</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                        <SelectItem value="slack">Slack</SelectItem>
                        <SelectItem value="webhook">Custom Webhook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Platform Configs */}
              {['polymarket', 'kalshi'].map((platform) => (
                <Card key={platform}>
                  <CardHeader>
                    <CardTitle className="capitalize">{platform} Settings</CardTitle>
                    <CardDescription>Platform-specific configuration</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Monitoring Enabled</Label>
                      <Switch
                        checked={config?.platforms?.[platform as Platform]?.enabled}
                        onCheckedChange={(checked) =>
                          updateConfig({ enabled: checked }, platform as Platform)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Min Market Liquidity ($)</Label>
                      <Input
                        type="number"
                        value={config?.platforms?.[platform as Platform]?.minMarketLiquidity || 10000}
                        onChange={(e) =>
                          updateConfig(
                            { minMarketLiquidity: parseFloat(e.target.value) },
                            platform as Platform
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Big Trade Threshold ($)</Label>
                      <Input
                        type="number"
                        value={config?.platforms?.[platform as Platform]?.bigTradeUsdThreshold || 1000}
                        onChange={(e) =>
                          updateConfig(
                            { bigTradeUsdThreshold: parseFloat(e.target.value) },
                            platform as Platform
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Big Trade % Threshold</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={config?.platforms?.[platform as Platform]?.bigTradePercentThreshold || 2}
                        onChange={(e) =>
                          updateConfig(
                            { bigTradePercentThreshold: parseFloat(e.target.value) },
                            platform as Platform
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Polling Interval (seconds)</Label>
                      <Input
                        type="number"
                        value={config?.platforms?.[platform as Platform]?.pollingInterval || 10}
                        onChange={(e) =>
                          updateConfig(
                            { pollingInterval: parseInt(e.target.value) },
                            platform as Platform
                          )
                        }
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>Configure how you receive alerts. Save settings before testing.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Telegram */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Telegram</h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Bot Token</Label>
                      <Input
                        type="password"
                        id="telegram-bot-token"
                        placeholder="Enter your Telegram bot token"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Chat ID</Label>
                      <Input
                        id="telegram-chat-id"
                        placeholder="Enter your Telegram chat ID"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const botToken = (document.getElementById('telegram-bot-token') as HTMLInputElement)?.value;
                          const chatId = (document.getElementById('telegram-chat-id') as HTMLInputElement)?.value;
                          if (!botToken || !chatId) {
                            toast.error('Please enter both bot token and chat ID');
                            return;
                          }
                          const res = await fetch('/api/notifications', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'configure', type: 'telegram', config: { botToken, chatId } }),
                          });
                          const data = await res.json();
                          toast[data.success ? 'success' : 'error'](data.success ? 'Telegram settings saved!' : data.error);
                        }}
                      >
                        Save Settings
                      </Button>
                      <Button
                        onClick={async () => {
                          const res = await fetch('/api/notifications', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'test', type: 'telegram' }),
                          });
                          const data = await res.json();
                          toast[data.success ? 'success' : 'error'](data.success ? 'Test notification sent!' : data.error);
                        }}
                      >
                        Send Test
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Discord */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Discord</h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Webhook URL</Label>
                      <Input
                        type="password"
                        id="discord-webhook"
                        placeholder="https://discord.com/api/webhooks/..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const webhookUrl = (document.getElementById('discord-webhook') as HTMLInputElement)?.value;
                          if (!webhookUrl) {
                            toast.error('Please enter a webhook URL');
                            return;
                          }
                          const res = await fetch('/api/notifications', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'configure', type: 'discord', config: { webhookUrl } }),
                          });
                          const data = await res.json();
                          toast[data.success ? 'success' : 'error'](data.success ? 'Discord settings saved!' : data.error);
                        }}
                      >
                        Save Settings
                      </Button>
                      <Button
                        onClick={async () => {
                          const res = await fetch('/api/notifications', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'test', type: 'discord' }),
                          });
                          const data = await res.json();
                          toast[data.success ? 'success' : 'error'](data.success ? 'Test notification sent!' : data.error);
                        }}
                      >
                        Send Test
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Slack */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">Slack</h3>
                  <div className="grid gap-4">
                    <div className="space-y-2">
                      <Label>Webhook URL</Label>
                      <Input
                        type="password"
                        id="slack-webhook"
                        placeholder="https://hooks.slack.com/services/..."
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const webhookUrl = (document.getElementById('slack-webhook') as HTMLInputElement)?.value;
                          if (!webhookUrl) {
                            toast.error('Please enter a webhook URL');
                            return;
                          }
                          const res = await fetch('/api/notifications', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'configure', type: 'slack', config: { webhookUrl } }),
                          });
                          const data = await res.json();
                          toast[data.success ? 'success' : 'error'](data.success ? 'Slack settings saved!' : data.error);
                        }}
                      >
                        Save Settings
                      </Button>
                      <Button
                        onClick={async () => {
                          const res = await fetch('/api/notifications', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'test', type: 'slack' }),
                          });
                          const data = await res.json();
                          toast[data.success ? 'success' : 'error'](data.success ? 'Test notification sent!' : data.error);
                        }}
                      >
                        Send Test
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
