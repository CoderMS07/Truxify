import 'package:flutter/material.dart';

class LoadPostingScreen extends StatefulWidget {
  const LoadPostingScreen({super.key});

  @override
  State<LoadPostingScreen> createState() => _LoadPostingScreenState();
}

class _LoadPostingScreenState extends State<LoadPostingScreen> {
  int _currentStep = 0;

  // Controllers for Step 1: Location
  final TextEditingController _pickupController = TextEditingController();
  final TextEditingController _dropoffController = TextEditingController();

  // Controllers/State for Step 2: Cargo Details
  final TextEditingController _weightController = TextEditingController();
  final TextEditingController _materialController = TextEditingController();
  String? _selectedTruckType;
  final List<String> _truckTypes = [
    'Light Commercial Vehicle (LCV)',
    'Medium Duty Truck',
    'Heavy Duty Truck',
    'Trailer',
    'Refrigerated (Reefer)',
  ];

  // Controllers for Step 3: Pricing
  final TextEditingController _budgetController = TextEditingController();

  @override
  void dispose() {
    _pickupController.dispose();
    _dropoffController.dispose();
    _weightController.dispose();
    _materialController.dispose();
    _budgetController.dispose();
    super.dispose();
  }

  void _submitLoad() {
    // Collect the data from controllers and submit to API
    final data = {
      'pickup': _pickupController.text,
      'dropoff': _dropoffController.text,
      'truckType': _selectedTruckType,
      'weight': _weightController.text,
      'material': _materialController.text,
      'budget': _budgetController.text,
    };

    // TODO: Send data to the backend

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Load posted successfully!'),
        backgroundColor: Colors.green,
      ),
    );

    // Optional: pop the screen after posting
    // Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Post a Load'),
        centerTitle: true,
      ),
      body: Stepper(
        type: StepperType.vertical,
        currentStep: _currentStep,
        onStepContinue: () {
          if (_currentStep < 2) {
            setState(() {
              _currentStep += 1;
            });
          } else {
            _submitLoad();
          }
        },
        onStepCancel: () {
          if (_currentStep > 0) {
            setState(() {
              _currentStep -= 1;
            });
          }
        },
        controlsBuilder: (BuildContext context, ControlsDetails details) {
          final isLastStep = _currentStep == 2;
          return Padding(
            padding: const EdgeInsets.only(top: 24.0),
            child: Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: details.onStepContinue,
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: Text(isLastStep ? 'Post Load' : 'Continue'),
                  ),
                ),
                if (_currentStep > 0) const SizedBox(width: 12),
                if (_currentStep > 0)
                  Expanded(
                    child: OutlinedButton(
                      onPressed: details.onStepCancel,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                      child: const Text('Back'),
                    ),
                  ),
              ],
            ),
          );
        },
        steps: [
          Step(
            title: const Text('Location Details', style: TextStyle(fontWeight: FontWeight.bold)),
            content: Column(
              children: [
                TextFormField(
                  controller: _pickupController,
                  decoration: const InputDecoration(
                    labelText: 'Pick-up Location',
                    hintText: 'Enter origin city or address',
                    prefixIcon: Icon(Icons.location_searching),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _dropoffController,
                  decoration: const InputDecoration(
                    labelText: 'Drop-off Location',
                    hintText: 'Enter destination city or address',
                    prefixIcon: Icon(Icons.location_on),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Note: Full place autocomplete will be enabled shortly.',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
            isActive: _currentStep >= 0,
            state: _currentStep > 0 ? StepState.complete : StepState.indexed,
          ),
          Step(
            title: const Text('Cargo Details', style: TextStyle(fontWeight: FontWeight.bold)),
            content: Column(
              children: [
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(
                    labelText: 'Required Truck Type',
                    prefixIcon: Icon(Icons.local_shipping),
                    border: OutlineInputBorder(),
                  ),
                  value: _selectedTruckType,
                  items: _truckTypes.map((type) {
                    return DropdownMenuItem(
                      value: type,
                      child: Text(type),
                    );
                  }).toList(),
                  onChanged: (value) {
                    setState(() {
                      _selectedTruckType = value;
                    });
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _weightController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Total Weight (Tons)',
                    hintText: 'e.g. 15',
                    prefixIcon: Icon(Icons.scale),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _materialController,
                  decoration: const InputDecoration(
                    labelText: 'Material / Commodity Type',
                    hintText: 'e.g. Steel, Electronics, Textiles',
                    prefixIcon: Icon(Icons.inventory_2),
                    border: OutlineInputBorder(),
                  ),
                ),
              ],
            ),
            isActive: _currentStep >= 1,
            state: _currentStep > 1 ? StepState.complete : StepState.indexed,
          ),
          Step(
            title: const Text('Pricing', style: TextStyle(fontWeight: FontWeight.bold)),
            content: Column(
              children: [
                TextFormField(
                  controller: _budgetController,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Expected Budget (INR)',
                    hintText: 'e.g. 15000',
                    prefixIcon: Icon(Icons.currency_rupee),
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Providing an accurate budget helps attract better matches.',
                  style: TextStyle(color: Colors.grey, fontSize: 12),
                ),
              ],
            ),
            isActive: _currentStep >= 2,
            state: StepState.indexed,
          ),
        ],
      ),
    );
  }
}
