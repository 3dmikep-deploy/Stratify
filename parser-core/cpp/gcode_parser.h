// parser-core/cpp/gcode_parser.h
#pragma once

#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <optional>

namespace GCodeAnalyzer {

// Represents a single G-code command
struct GCodeCommand {
    char type;              // G, M, T, etc.
    int code;              // Command number
    std::unordered_map<char, double> parameters;  // X, Y, Z, E, F, etc.
    std::string comment;    // Inline comments
    size_t lineNumber;
};

// Extracted metadata from slicer comments
struct SlicerMetadata {
    std::string slicerName;
    std::string slicerVersion;
    std::unordered_map<std::string, std::string> settings;
    
    // Common parameters
    std::optional<double> layerHeight;
    std::optional<double> nozzleTemp;
    std::optional<double> bedTemp;
    std::optional<double> printSpeed;
    std::optional<double> infillDensity;
    std::optional<std::string> filamentType;
};

// Geometric analysis results
struct GeometricAnalysis {
    struct LayerInfo {
        double z;
        double thickness;
        int commandCount;
        double extrusionVolume;
        double travelDistance;
        double printTime;
    };
    
    std::vector<LayerInfo> layers;
    double totalVolume;
    double boundingBox[6];  // min/max XYZ
    double estimatedPrintTime;
    
    // Inferred parameters
    double inferredLayerHeight;
    double inferredNozzleDiameter;
    double inferredExtrusionWidth;
    std::string inferredPattern;
};

class GCodeParser {
private:
    std::vector<GCodeCommand> commands;
    SlicerMetadata metadata;
    GeometricAnalysis analysis;
    
    // Parser state
    double currentPosition[4] = {0, 0, 0, 0};  // X, Y, Z, E
    bool relativeMode = false;
    bool relativeExtrusion = false;
    double feedRate = 0;
    
    // Helper methods
    void parseMetadataComment(const std::string& comment);
    void updatePosition(const GCodeCommand& cmd);
    void analyzeGeometry();
    double calculateExtrusionVolume(double e, double filamentDiameter);
    
public:
    GCodeParser();
    ~GCodeParser();
    
    // Main parsing functions
    bool parseFile(const std::string& filepath);
    bool parseStream(std::istream& stream);
    
    // Analysis functions
    void extractSlicerMetadata();
    void performGeometricAnalysis();
    void inferSlicingParameters();
    
    // Data access
    const std::vector<GCodeCommand>& getCommands() const { return commands; }
    const SlicerMetadata& getMetadata() const { return metadata; }
    const GeometricAnalysis& getAnalysis() const { return analysis; }
    
    // Export functions
    std::string toJSON() const;
    void exportToCSV(const std::string& filepath) const;
};

// Pattern recognition for infill detection
class PatternRecognizer {
public:
    enum class InfillPattern {
        RECTILINEAR,
        GRID,
        TRIANGLES,
        HONEYCOMB,
        GYROID,
        CONCENTRIC,
        UNKNOWN
    };
    
    static InfillPattern detectPattern(const std::vector<GCodeCommand>& layerCommands);
    static double calculateInfillDensity(const std::vector<GCodeCommand>& commands,
                                        double boundingArea);
};

// Optimization suggestions based on analysis
class OptimizationEngine {
public:
    struct Suggestion {
        std::string category;
        std::string description;
        double potentialTimeSaving;  // in minutes
        double potentialMaterialSaving;  // in grams
        std::string implementation;
    };
    
    static std::vector<Suggestion> analyzePrintOptimizations(
        const GeometricAnalysis& analysis,
        const SlicerMetadata& metadata
    );
};

} // namespace GCodeAnalyzer