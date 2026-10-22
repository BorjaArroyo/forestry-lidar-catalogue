"""Linux process-tree memory observations for bounded browser acceptance."""
from pathlib import Path
import os
import threading


class ProcessMemory:
    def __init__(self):
        self.peak_rss=0;self.peak_pss=0;self.samples=0;self.stop_event=threading.Event()

    def sample(self):
        parents={}
        for item in Path('/proc').iterdir():
            if not item.name.isdigit():continue
            try:
                fields=(item/'stat').read_text().rsplit(')',1)[1].split();parents[int(item.name)]=int(fields[1])
            except (OSError,ValueError,IndexError):continue
        selected={os.getpid()}
        while True:
            new={pid for pid,parent in parents.items() if parent in selected}
            if new<=selected:break
            selected|=new
        rss=pss=0
        for pid in selected:
            try:
                lines=(Path('/proc')/str(pid)/'smaps_rollup').read_text().splitlines()
                values={line.split(':',1)[0]:int(line.split()[1])*1024 for line in lines if line.startswith(('Rss:','Pss:'))}
                rss+=values.get('Rss',0);pss+=values.get('Pss',0)
            except (OSError,ValueError):continue
        self.peak_rss=max(self.peak_rss,rss);self.peak_pss=max(self.peak_pss,pss);self.samples+=1

    def start(self):
        def run():
            while not self.stop_event.is_set():self.sample();self.stop_event.wait(.5)
        self.thread=threading.Thread(target=run,daemon=True);self.thread.start();return self

    def finish(self):
        self.stop_event.set();self.thread.join(timeout=2);self.sample()
        return dict(process_tree_rss_sum_peak_bytes=self.peak_rss,process_tree_pss_sum_peak_bytes=self.peak_pss,
                    sampling_interval_seconds=.5,samples=self.samples,
                    scope='Sampled local browser, Playwright and acceptance Python process tree; RSS double-counts shared pages, PSS apportions them')
