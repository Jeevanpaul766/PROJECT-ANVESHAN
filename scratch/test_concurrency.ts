async function testConcurrency() {
  const start = Date.now();
  console.log("Starting 2 simultaneous requests to qwen2.5:7b...");

  async function makeReq(id: number) {
    const reqStart = Date.now();
    console.log(`[Req ${id}] Dispatched at T+${Date.now() - start}ms`);
    const res = await fetch("http://127.0.0.1:11434/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b",
        messages: [
          { role: "user", content: `Write a 50 word summary of lithium metal batteries for request ${id}.` },
        ],
        max_tokens: 150,
      }),
    });
    const data = await res.json();
    const duration = Date.now() - reqStart;
    console.log(`[Req ${id}] Completed in ${duration}ms (at T+${Date.now() - start}ms)`);
    return { id, duration };
  }

  const results = await Promise.all([makeReq(1), makeReq(2)]);
  const total = Date.now() - start;
  console.log(`\nResults:`);
  console.log(`Req 1: ${results[0].duration}ms`);
  console.log(`Req 2: ${results[1].duration}ms`);
  console.log(`Total Wall-Clock: ${total}ms`);
  console.log(`Ratio Total / (Req1 + Req2): ${(total / (results[0].duration + results[1].duration)).toFixed(2)}`);
}

testConcurrency().catch(console.error);
