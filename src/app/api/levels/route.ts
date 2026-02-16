import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for custom levels (works globally for all users)
let customLevels: Record<string, Array<{
  type: string;
  x: number;
  y: number;
  width?: number;
  dangerous?: boolean;
  hasSpike?: boolean;
  mode?: string;
}>> = {};

export async function GET() {
  return NextResponse.json(customLevels);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, difficulty, obstacles } = body;

    switch (action) {
      case 'saveLevel':
        if (difficulty && obstacles) {
          customLevels[difficulty] = obstacles;
        }
        break;

      case 'clearLevel':
        if (difficulty) {
          delete customLevels[difficulty];
        }
        break;

      case 'clearAll':
        customLevels = {};
        break;

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json({ success: true, levels: customLevels });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
  }
}
