import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// Get database connection
function getDb() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL not set');
    return null;
  }
  return neon(dbUrl);
}

// Default settings
const DEFAULT_SETTINGS = {
  minWithdraw: 1.00,
  sponsorLink: 'https://omg10.com/4/10607605',
  customPromoCodes: {
    TOESJABLOX: { credits: 100, plays: 100, cash: 0, event_type: 'none', max_uses: 0 },
    ANNA: { credits: 50, plays: 0, cash: 0, event_type: 'emoji', emoji: '🌸💖💕🌹🥀', max_uses: 0 },
    VALENTINE: { credits: 0, plays: 0, cash: 0, event_type: 'text', message: '💕 Heart skin unlocked!', max_uses: 1 }
  },
  adminBroadcasts: [],
  customTasks: [],
  customLevels: {},
  customWithdrawMethods: [],
  errorReports: []
};

export async function GET() {
  const sql = getDb();
  if (!sql) {
    return NextResponse.json(DEFAULT_SETTINGS);
  }

  try {
    // Try to get settings
    const result = await sql`
      SELECT * FROM global_settings WHERE id = 1 LIMIT 1
    `;
    
    if (result.length === 0) {
      // No settings yet, return defaults
      return NextResponse.json(DEFAULT_SETTINGS);
    }
    
    const settings = result[0];
    return NextResponse.json({
      minWithdraw: settings.min_withdraw || DEFAULT_SETTINGS.minWithdraw,
      sponsorLink: settings.sponsor_link || DEFAULT_SETTINGS.sponsorLink,
      customPromoCodes: settings.custom_promo_codes || DEFAULT_SETTINGS.customPromoCodes,
      adminBroadcasts: settings.admin_broadcasts || [],
      customTasks: settings.custom_tasks || [],
      customLevels: settings.custom_levels || {},
      customWithdrawMethods: settings.custom_withdraw_methods || [],
      errorReports: settings.error_reports || []
    });
  } catch (error) {
    console.error('Database error in GET global:', error);
    // Return defaults on error
    return NextResponse.json(DEFAULT_SETTINGS);
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

    // Get current settings first
    let settings: any = { ...DEFAULT_SETTINGS };
    try {
      const result = await sql`
        SELECT * FROM global_settings WHERE id = 1 LIMIT 1
      `;
      if (result.length > 0) {
        settings = {
          minWithdraw: result[0].min_withdraw || DEFAULT_SETTINGS.minWithdraw,
          sponsorLink: result[0].sponsor_link || DEFAULT_SETTINGS.sponsorLink,
          customPromoCodes: result[0].custom_promo_codes || DEFAULT_SETTINGS.customPromoCodes,
          adminBroadcasts: result[0].admin_broadcasts || [],
          customTasks: result[0].custom_tasks || [],
          customLevels: result[0].custom_levels || {},
          customWithdrawMethods: result[0].custom_withdraw_methods || [],
          errorReports: result[0].error_reports || []
        };
      }
    } catch (e) {
      // Table might not exist yet
    }

    switch (action) {
      case 'sendBroadcast': {
        settings.adminBroadcasts.push({
          message: data.message,
          type: data.type || 'info',
          timestamp: Date.now(),
          id: Date.now()
        });
        if (settings.adminBroadcasts.length > 20) {
          settings.adminBroadcasts = settings.adminBroadcasts.slice(-20);
        }
        break;
      }
      
      case 'createPromoCode': {
        settings.customPromoCodes[data.code] = {
          credits: data.credits || 0,
          plays: data.plays || 0,
          cash: data.cash || 0,
          event_type: data.eventType || 'none',
          emoji: data.emoji,
          message: data.message,
          max_uses: data.maxUses || 0
        };
        break;
      }
      
      case 'deletePromoCode': {
        delete settings.customPromoCodes[data.code];
        break;
      }
      
      case 'updatePromoCode': {
        if (settings.customPromoCodes[data.code]) {
          settings.customPromoCodes[data.code] = {
            ...settings.customPromoCodes[data.code],
            credits: data.credits ?? settings.customPromoCodes[data.code].credits,
            plays: data.plays ?? settings.customPromoCodes[data.code].plays,
            cash: data.cash ?? settings.customPromoCodes[data.code].cash,
            max_uses: data.maxUses ?? settings.customPromoCodes[data.code].max_uses
          };
        }
        break;
      }
      
      case 'setMinWithdraw': {
        settings.minWithdraw = data.min;
        break;
      }
      
      case 'setSponsorLink': {
        settings.sponsorLink = data.link;
        break;
      }
      
      case 'submitWithdrawal': {
        try {
          await sql`
            INSERT INTO withdrawals (username, amount, method, account, status)
            VALUES (${data.user || 'anonymous'}, ${data.amount}, ${data.method}, ${data.account}, 'pending')
          `;
        } catch (e) {
          console.error('Withdrawal insert error:', e);
        }
        break;
      }
      
      case 'updateWithdrawalStatus': {
        try {
          await sql`
            UPDATE withdrawals SET status = ${data.status} WHERE id = ${data.id}
          `;
        } catch (e) {
          console.error('Withdrawal update error:', e);
        }
        break;
      }
      
      case 'deleteWithdrawal': {
        try {
          await sql`DELETE FROM withdrawals WHERE id = ${data.id}`;
        } catch (e) {
          console.error('Withdrawal delete error:', e);
        }
        break;
      }
      
      case 'createTask': {
        settings.customTasks.push({
          id: Date.now(),
          name: data.name,
          type: data.type,
          url: data.url,
          reward: data.reward,
          cooldown: data.cooldown || 24,
          html_content: data.htmlContent
        });
        break;
      }
      
      case 'deleteTask': {
        settings.customTasks = settings.customTasks.filter((t: any) => t.id !== data.id);
        break;
      }
      
      case 'saveCustomLevel': {
        settings.customLevels[data.levelName] = {
          obstacles: data.obstacles,
          distance: data.distance || 500
        };
        break;
      }
      
      case 'deleteCustomLevel': {
        delete settings.customLevels[data.levelName];
        break;
      }
      
      case 'reportError': {
        settings.errorReports.push({
          id: Date.now(),
          message: data.message,
          user: data.user || 'anonymous',
          timestamp: Date.now(),
          resolved: false
        });
        if (settings.errorReports.length > 100) {
          settings.errorReports = settings.errorReports.slice(-100);
        }
        break;
      }
      
      case 'deleteErrorReport': {
        settings.errorReports = settings.errorReports.filter((e: any) => e.id !== data.id);
        break;
      }
      
      case 'createWithdrawMethod': {
        settings.customWithdrawMethods.push({
          id: Date.now(),
          name: data.name,
          icon: data.icon || '💵'
        });
        break;
      }
      
      case 'deleteWithdrawMethod': {
        settings.customWithdrawMethods = settings.customWithdrawMethods.filter((m: any) => m.id !== data.id);
        break;
      }
      
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
    
    // Save settings back to database
    try {
      await sql`
        INSERT INTO global_settings (
          id, min_withdraw, sponsor_link, custom_promo_codes, admin_broadcasts,
          custom_tasks, custom_levels, custom_withdraw_methods, error_reports
        ) VALUES (
          1, ${settings.minWithdraw}, ${settings.sponsorLink},
          ${JSON.stringify(settings.customPromoCodes)}::jsonb,
          ${JSON.stringify(settings.adminBroadcasts)}::jsonb,
          ${JSON.stringify(settings.customTasks)}::jsonb,
          ${JSON.stringify(settings.customLevels)}::jsonb,
          ${JSON.stringify(settings.customWithdrawMethods)}::jsonb,
          ${JSON.stringify(settings.errorReports)}::jsonb
        )
        ON CONFLICT (id) DO UPDATE SET
          min_withdraw = ${settings.minWithdraw},
          sponsor_link = ${settings.sponsorLink},
          custom_promo_codes = ${JSON.stringify(settings.customPromoCodes)}::jsonb,
          admin_broadcasts = ${JSON.stringify(settings.adminBroadcasts)}::jsonb,
          custom_tasks = ${JSON.stringify(settings.customTasks)}::jsonb,
          custom_levels = ${JSON.stringify(settings.customLevels)}::jsonb,
          custom_withdraw_methods = ${JSON.stringify(settings.customWithdrawMethods)}::jsonb,
          error_reports = ${JSON.stringify(settings.errorReports)}::jsonb
      `;
    } catch (e) {
      console.error('Settings save error:', e);
    }
    
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('Global API error:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
