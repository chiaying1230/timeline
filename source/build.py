"""Build the independent historical timeline. No other exhibition is generated."""
import argparse
from pathlib import Path
from build_reader import build_reader

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default=str(Path(__file__).resolve().parent.parent))
    build_reader(parser.parse_args().out)
