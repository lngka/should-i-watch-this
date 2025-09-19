import { NextRequest, NextResponse } from 'next/server';

/**
 * Update search history when analysis completes
 * This endpoint is called from the results page to update the search status
 */
export async function POST(req: NextRequest) {
  try {
    const { jobId, updates } = await req.json();
    
    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    // Note: This is a client-side operation, but we provide the endpoint
    // for potential future server-side integration
    return NextResponse.json({ 
      message: 'Search history update should be handled client-side',
      jobId 
    });
    
  } catch (error) {
    console.error('Error in search history API:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

/**
 * Get search history (for potential future use)
 */
export async function GET() {
  return NextResponse.json({ 
    message: 'Search history is stored client-side in localStorage' 
  });
}
