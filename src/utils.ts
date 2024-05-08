export function sleep(milli: number) {
    return new Promise(resolve => {
        setTimeout(resolve, milli);
    });
}

export function buildProgressBtnText(percent: number, chars: number = 10) {
    let progress = Math.floor(percent * chars);
    let empty = chars - progress;
    return '█'.repeat(progress) + '░'.repeat(empty) + ` (${Math.floor(percent * 1000) / 10}%)`;
}
export function buildProgressText(error: number,sent: number,total: number){
    return `⌛ Progress: ${error + (sent)}/${total}
✅ Sent: ${sent}
❌ Error: ${error} (${Math.floor((error / total) * 10000) / 100}%)`;
}