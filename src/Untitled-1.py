#!/usr/bin/env python3

# convert dictonary to json file
import json

def read_word_list(file_path):
    """Reads a list of words from a text file and returns them as a list."""
    with open(file_path, 'r') as file:
        words = [line.strip() for line in file if line.strip()]
    return words

if __name__ == "__main__":
    word_list = read_word_list('./src/dictionary.txt')
    with open('words.json', 'w') as json_file:
        json.dump(word_list, json_file, indent=4)
    print(f"Converted {len(word_list)} words to words.json")