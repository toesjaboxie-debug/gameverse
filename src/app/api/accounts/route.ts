import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// Helper to get client IP
function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  return 'unknown';
}

// Get database connection
function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    return null;
  }
  return neon(dbUrl);
}

// Default stats for new accounts
const DEFAULT_HIGH_SCORES = {
  flappy: { easy: 0, medium: 0, hard: 0, impossible: 0 },
  geometry: { easy: 0, medium: 0, hard: 0, impossible: 0 }
};

const DEFAULT_COMPLETED_LEVELS = {
  flappy: { easy: false, medium: false, hard: false, impossible: false },
  geometry: { easy: false, medium: false, hard: false, impossible: false }
};

const DEFAULT_OWNED_SKINS = { flappy: ['default'], geometry: ['default', 'heart'] };
const DEFAULT_SELECTED_SKINS = { flappy: 'default', geometry: 'default' };

export async function GET(request: NextRequest) {
  const sql = getDb();
  if (!sql) {
    return NextResponse.json({ 
      accounts: [],
      error: 'Database not configured'
    });
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const ip = searchParams.get('ip');
  const clientIP = getClientIP(request);
  
  try {
    // IP-based auto-login
    if (ip === 'true') {
      const result = await sql`
        SELECT * FROM accounts WHERE ip_address = ${clientIP} LIMIT 1
      `;
      
      if (result.length > 0) {
        const account = result[0];
        return NextResponse.json({ 
          autoLogin: true, 
          account: {
            username: account.username,
            isAdmin: account.is_admin,
            createdAt: account.created_at,
            ipAddress: account.ip_address,
            stats: {
              credits: account.credits,
              plays: account.plays,
              cashBalance: parseFloat(account.cash_balance || 0),
              highScores: account.high_scores || DEFAULT_HIGH_SCORES,
              completedLevels: account.completed_levels || DEFAULT_COMPLETED_LEVELS,
              ownedSkins: account.owned_skins || DEFAULT_OWNED_SKINS,
              selectedSkins: account.selected_skins || DEFAULT_SELECTED_SKINS,
              lastDailyClaim: account.last_daily_claim || 0,
              sponsorVisited: account.sponsor_visited || false,
              completedTasks: account.completed_tasks || {},
              usedPromoCodes: account.used_promo_codes || {}
            }
          },
          ip: clientIP
        });
      }
      
      return NextResponse.json({ 
        autoLogin: false, 
        ip: clientIP 
      });
    }
    
    // Get specific account
    if (username) {
      const result = await sql`
        SELECT * FROM accounts WHERE username = ${username.toUpperCase()} LIMIT 1
      `;
      
      if (result.length > 0) {
        const account = result[0];
        return NextResponse.json({ 
          exists: true, 
          account: {
            username: account.username,
            isAdmin: account.is_admin,
            createdAt: account.created_at,
            ipAddress: account.ip_address,
            stats: {
              credits: account.credits,
              plays: account.plays,
              cashBalance: parseFloat(account.cash_balance || 0),
              highScores: account.high_scores || DEFAULT_HIGH_SCORES,
              completedLevels: account.completed_levels || DEFAULT_COMPLETED_LEVELS,
              ownedSkins: account.owned_skins || DEFAULT_OWNED_SKINS,
              selectedSkins: account.selected_skins || DEFAULT_SELECTED_SKINS,
              lastDailyClaim: account.last_daily_claim || 0,
              sponsorVisited: account.sponsor_visited || false,
              completedTasks: account.completed_tasks || {},
              usedPromoCodes: account.used_promo_codes || {}
            }
          }
        });
      }
      
      return NextResponse.json({ exists: false });
    }
    
    // List all accounts
    const result = await sql`
      SELECT username, is_admin, created_at, ip_address, credits, plays, cash_balance FROM accounts
    `;
    
    return NextResponse.json({ 
      accounts: result.map((a: any) => ({
        username: a.username,
        isAdmin: a.is_admin,
        createdAt: a.created_at,
        ipAddress: a.ip_address,
        stats: {
          credits: a.credits,
          plays: a.plays,
          cashBalance: parseFloat(a.cash_balance || 0)
        }
      }))
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json({ 
      accounts: [],
      error: 'Database error'
    });
  }
}

export async function POST(request: NextRequest) {
  const sql = getDb();
  if (!sql) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { action, data } = body;
    const clientIP = getClientIP(request);

    switch (action) {
      case 'register': {
        const { username, password } = data;
        
        if (!username || username.length < 3 || username.length > 20) {
          return NextResponse.json({ error: 'Username must be 3-20 characters' }, { status: 400 });
        }
        
        const upperUsername = username.toUpperCase();
        
        // Check if exists
        const existing = await sql`
          SELECT username FROM accounts WHERE username = ${upperUsername} LIMIT 1
        `;
        
        if (existing.length > 0) {
          return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
        }
        
        // Create account
        try {
          await sql`
            INSERT INTO accounts (
              username, password, ip_address, credits, plays, cash_balance,
              high_scores, completed_levels, owned_skins, selected_skins,
              last_daily_claim, sponsor_visited, completed_tasks, used_promo_codes
            ) VALUES (
              ${upperUsername}, ${password || ''}, ${clientIP}, 100, 10, 0,
              ${JSON.stringify(DEFAULT_HIGH_SCORES)}::jsonb,
              ${JSON.stringify(DEFAULT_COMPLETED_LEVELS)}::jsonb,
              ${JSON.stringify(DEFAULT_OWNED_SKINS)}::jsonb,
              ${JSON.stringify(DEFAULT_SELECTED_SKINS)}::jsonb,
              0, false, '{}'::jsonb, '{}'::jsonb
            )
          `;
          
          return NextResponse.json({ 
            success: true, 
            account: {
              username: upperUsername,
              isAdmin: false,
              stats: {
                credits: 100,
                plays: 10,
                cashBalance: 0,
                highScores: DEFAULT_HIGH_SCORES,
                completedLevels: DEFAULT_COMPLETED_LEVELS,
                ownedSkins: DEFAULT_OWNED_SKINS,
                selectedSkins: DEFAULT_SELECTED_SKINS,
                lastDailyClaim: 0,
                sponsorVisited: false,
                completedTasks: {},
                usedPromoCodes: {}
              }
            },
            ip: clientIP 
          });
        } catch (insertError: any) {
          console.error('Insert error:', insertError);
          if (insertError.code === '23505') {
            return NextResponse.json({ error: 'Username already exists' }, { status: 400 });
          }
          return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
        }
      }
      
      case 'login': {
        const { username, password } = data;
        const upperUsername = username?.toUpperCase();
        
        const result = await sql`
          SELECT * FROM accounts WHERE username = ${upperUsername} LIMIT 1
        `;
        
        if (result.length === 0) {
          return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }
        
        const account = result[0];
        
        // Check password (allow empty for guest accounts)
        if (account.password !== '' && account.password !== password) {
          return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
        }
        
        // Update IP on login
        await sql`
          UPDATE accounts SET ip_address = ${clientIP} WHERE username = ${upperUsername}
        `;
        
        return NextResponse.json({ 
          success: true, 
          account: {
            username: account.username,
            isAdmin: account.is_admin,
            stats: {
              credits: account.credits,
              plays: account.plays,
              cashBalance: parseFloat(account.cash_balance || 0),
              highScores: account.high_scores || DEFAULT_HIGH_SCORES,
              completedLevels: account.completed_levels || DEFAULT_COMPLETED_LEVELS,
              ownedSkins: account.owned_skins || DEFAULT_OWNED_SKINS,
              selectedSkins: account.selected_skins || DEFAULT_SELECTED_SKINS,
              lastDailyClaim: account.last_daily_claim || 0,
              sponsorVisited: account.sponsor_visited || false,
              completedTasks: account.completed_tasks || {},
              usedPromoCodes: account.used_promo_codes || {}
            }
          },
          ip: clientIP 
        });
      }
      
      case 'saveStats': {
        const { username, stats } = data;
        const upperUsername = username?.toUpperCase();
        
        if (!stats) {
          return NextResponse.json({ error: 'No stats provided' }, { status: 400 });
        }
        
        await sql`
          UPDATE accounts SET
            credits = COALESCE(${stats.credits}, credits),
            plays = COALESCE(${stats.plays}, plays),
            cash_balance = COALESCE(${stats.cashBalance}, cash_balance),
            high_scores = COALESCE(${stats.highScores ? JSON.stringify(stats.highScores) : null}::jsonb, high_scores),
            completed_levels = COALESCE(${stats.completedLevels ? JSON.stringify(stats.completedLevels) : null}::jsonb, completed_levels),
            owned_skins = COALESCE(${stats.ownedSkins ? JSON.stringify(stats.ownedSkins) : null}::jsonb, owned_skins),
            selected_skins = COALESCE(${stats.selectedSkins ? JSON.stringify(stats.selectedSkins) : null}::jsonb, selected_skins),
            last_daily_claim = COALESCE(${stats.lastDailyClaim}, last_daily_claim),
            sponsor_visited = COALESCE(${stats.sponsorVisited}, sponsor_visited),
            completed_tasks = COALESCE(${stats.completedTasks ? JSON.stringify(stats.completedTasks) : null}::jsonb, completed_tasks),
            used_promo_codes = COALESCE(${stats.usedPromoCodes ? JSON.stringify(stats.usedPromoCodes) : null}::jsonb, used_promo_codes)
          WHERE username = ${upperUsername}
        `;
        
        const result = await sql`
          SELECT credits, plays, cash_balance FROM accounts WHERE username = ${upperUsername} LIMIT 1
        `;
        
        if (result.length > 0) {
          return NextResponse.json({ 
            success: true, 
            stats: {
              credits: result[0].credits,
              plays: result[0].plays,
              cashBalance: parseFloat(result[0].cash_balance || 0)
            }
          });
        }
        
        return NextResponse.json({ success: true });
      }
      
      case 'getStats': {
        const { username } = data;
        const result = await sql`
          SELECT * FROM accounts WHERE username = ${username?.toUpperCase()} LIMIT 1
        `;
        
        if (result.length === 0) {
          return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }
        
        const account = result[0];
        return NextResponse.json({ 
          success: true, 
          stats: {
            credits: account.credits,
            plays: account.plays,
            cashBalance: parseFloat(account.cash_balance || 0),
            highScores: account.high_scores || DEFAULT_HIGH_SCORES,
            completedLevels: account.completed_levels || DEFAULT_COMPLETED_LEVELS,
            ownedSkins: account.owned_skins || DEFAULT_OWNED_SKINS,
            selectedSkins: account.selected_skins || DEFAULT_SELECTED_SKINS,
            lastDailyClaim: account.last_daily_claim || 0,
            sponsorVisited: account.sponsor_visited || false,
            completedTasks: account.completed_tasks || {},
            usedPromoCodes: account.used_promo_codes || {}
          }
        });
      }
      
      case 'buyCredits': {
        const { username, amount } = data;
        const upperUsername = username?.toUpperCase();
        
        const result = await sql`
          SELECT cash_balance, credits FROM accounts WHERE username = ${upperUsername} LIMIT 1
        `;
        
        if (result.length === 0) {
          return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }
        
        const account = result[0];
        const cost = (amount / 1000) * 0.01;
        
        if (parseFloat(account.cash_balance) < cost) {
          return NextResponse.json({ error: 'Insufficient cash balance' }, { status: 400 });
        }
        
        await sql`
          UPDATE accounts SET
            cash_balance = cash_balance - ${cost},
            credits = credits + ${amount}
          WHERE username = ${upperUsername}
        `;
        
        const updated = await sql`
          SELECT credits, cash_balance FROM accounts WHERE username = ${upperUsername} LIMIT 1
        `;
        
        return NextResponse.json({ 
          success: true, 
          credits: updated[0]?.credits,
          cashBalance: parseFloat(updated[0]?.cash_balance || 0)
        });
      }
      
      case 'transfer': {
        const { fromUser, toUser, credits, plays, cash } = data;
        const fromUpper = fromUser?.toUpperCase();
        const toUpper = toUser?.toUpperCase();
        
        if (fromUpper === toUpper) {
          return NextResponse.json({ error: 'Cannot transfer to yourself' }, { status: 400 });
        }
        
        const accounts = await sql`
          SELECT username, credits, plays, cash_balance FROM accounts WHERE username IN (${fromUpper}, ${toUpper})
        `;
        
        const fromAccount = accounts.find((a: any) => a.username === fromUpper);
        const toAccount = accounts.find((a: any) => a.username === toUpper);
        
        if (!fromAccount || !toAccount) {
          return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }
        
        const feeMultiplier = 1.01;
        const creditsNeeded = Math.ceil((credits || 0) * feeMultiplier);
        const playsNeeded = Math.ceil((plays || 0) * feeMultiplier);
        const cashNeeded = (cash || 0) * feeMultiplier;
        
        if (fromAccount.credits < creditsNeeded || fromAccount.plays < playsNeeded || parseFloat(fromAccount.cash_balance) < cashNeeded) {
          return NextResponse.json({ error: 'Insufficient funds (including 1% fee)' }, { status: 400 });
        }
        
        // Deduct from sender
        await sql`
          UPDATE accounts SET
            credits = credits - ${creditsNeeded},
            plays = plays - ${playsNeeded},
            cash_balance = cash_balance - ${cashNeeded}
          WHERE username = ${fromUpper}
        `;
        
        // Add to receiver
        await sql`
          UPDATE accounts SET
            credits = credits + ${credits || 0},
            plays = plays + ${plays || 0},
            cash_balance = cash_balance + ${cash || 0}
          WHERE username = ${toUpper}
        `;
        
        return NextResponse.json({ 
          success: true, 
          fee: '1%',
          transferred: { credits: credits || 0, plays: plays || 0, cash: cash || 0 }
        });
      }
      
      case 'getAllAccounts': {
        const { adminUser } = data;
        
        const adminResult = await sql`
          SELECT is_admin FROM accounts WHERE username = ${adminUser?.toUpperCase()} LIMIT 1
        `;
        
        if (adminResult.length === 0 || !adminResult[0].is_admin) {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }
        
        const result = await sql`SELECT * FROM accounts ORDER BY created_at DESC`;
        
        return NextResponse.json({ 
          accounts: result.map((a: any) => ({
            username: a.username,
            isAdmin: a.is_admin,
            createdAt: a.created_at,
            ipAddress: a.ip_address,
            stats: {
              credits: a.credits,
              plays: a.plays,
              cashBalance: parseFloat(a.cash_balance || 0),
              highScores: a.high_scores || DEFAULT_HIGH_SCORES,
              completedLevels: a.completed_levels || DEFAULT_COMPLETED_LEVELS,
              ownedSkins: a.owned_skins || DEFAULT_OWNED_SKINS,
              selectedSkins: a.selected_skins || DEFAULT_SELECTED_SKINS,
              lastDailyClaim: a.last_daily_claim || 0,
              sponsorVisited: a.sponsor_visited || false,
              completedTasks: a.completed_tasks || {},
              usedPromoCodes: a.used_promo_codes || {}
            }
          }))
        });
      }
      
      case 'giveToAllAccounts': {
        const { adminUser, credits, plays, cash } = data;
        
        const adminResult = await sql`
          SELECT is_admin FROM accounts WHERE username = ${adminUser?.toUpperCase()} LIMIT 1
        `;
        
        if (adminResult.length === 0 || !adminResult[0].is_admin) {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }
        
        await sql`
          UPDATE accounts SET
            credits = credits + ${credits || 0},
            plays = plays + ${plays || 0},
            cash_balance = cash_balance + ${cash || 0}
        `;
        
        const countResult = await sql`SELECT COUNT(*) as count FROM accounts`;
        
        return NextResponse.json({ 
          success: true, 
          totalAccounts: parseInt(countResult[0]?.count || 0),
          given: { credits: credits || 0, plays: plays || 0, cash: cash || 0 }
        });
      }
      
      case 'updateAccount': {
        const { adminUser, username, updates } = data;
        
        const adminResult = await sql`
          SELECT is_admin FROM accounts WHERE username = ${adminUser?.toUpperCase()} LIMIT 1
        `;
        
        if (adminResult.length === 0 || !adminResult[0].is_admin) {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }
        
        await sql`
          UPDATE accounts SET
            credits = COALESCE(${updates.credits}, credits),
            plays = COALESCE(${updates.plays}, plays),
            cash_balance = COALESCE(${updates.cashBalance}, cash_balance)
          WHERE username = ${username?.toUpperCase()}
        `;
        
        return NextResponse.json({ success: true });
      }
      
      case 'deleteAccount': {
        const { adminUser, username } = data;
        const upperAdmin = adminUser?.toUpperCase();
        const upperUsername = username?.toUpperCase();
        
        const adminResult = await sql`
          SELECT is_admin FROM accounts WHERE username = ${upperAdmin} LIMIT 1
        `;
        
        if (adminResult.length === 0 || !adminResult[0].is_admin) {
          return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
        }
        
        if (upperUsername === upperAdmin) {
          return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
        }
        
        await sql`DELETE FROM accounts WHERE username = ${upperUsername}`;
        return NextResponse.json({ success: true });
      }
      
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Account API error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
